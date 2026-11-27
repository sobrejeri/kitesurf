#!/usr/bin/env node
// Read-only HTTP companion to supabase/tests/95_storage_private_buckets.test.sql.
// Uses pre-existing synthetic fixture and two test students; never uploads/deletes.
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const PROJECT = 'qadkqjfmmnxvovyyhqxw';
const ORIGIN = 'https://'+PROJECT+'.supabase.co';
const BUCKET = 'vento-student-avatars';
const acceptedConfigs=new WeakSet();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const deny = error => error && [400,401,403,404].includes(Number(error.statusCode ?? error.status));
function claims(token) {
  try {
    if(typeof token !== 'string' || token.split('.').length !== 3) throw Error();
    return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  } catch { throw Error('Invalid test credential format'); }
}
export function configFromEnv(env) {
  if(env.STORAGE_TEST_CONFIRM_SYNTHETIC !== 'sim') throw Error('Synthetic-fixture confirmation required');
  if(env.STORAGE_TEST_URL !== ORIGIN) throw Error('Only the approved Kitesurf project is allowed');
  const key = env.STORAGE_TEST_PUBLISHABLE_KEY;
  if(typeof key !== 'string' || !key) throw Error('Publishable key required');
  if(!key.startsWith('sb_publishable_')) {
    const keyClaims = claims(key);
    if(keyClaims.role !== 'anon' || keyClaims.ref !== PROJECT) throw Error('Only a project publishable/anon key is allowed');
  }
  const ownerToken=env.STORAGE_TEST_OWNER_JWT, otherToken=env.STORAGE_TEST_OTHER_JWT;
  const owner=claims(ownerToken), other=claims(otherToken);
  for(const user of [owner,other]) {
    if(user.role !== 'authenticated' || user.iss !== ORIGIN+'/auth/v1'
      || !uuid.test(user.sub ?? '') || !Number.isSafeInteger(user.exp)
      || user.exp <= Math.floor(Date.now()/1000)+60) throw Error('Fresh Kitesurf user token required');
  }
  if(owner.sub === other.sub) throw Error('Two distinct test students are required');
  const path=env.STORAGE_TEST_FIXTURE_PATH;
  if(typeof path !== 'string' || !path.startsWith(owner.sub+'/')
    || !/^[a-zA-Z0-9_/-]+\.png$/.test(path) || path.includes('..')
    || path.includes('//')) throw Error('Explicit owner PNG fixture required');
  const hash=env.STORAGE_TEST_FIXTURE_SHA256;
  if(!/^[a-f0-9]{64}$/.test(hash ?? '')) throw Error('Known synthetic fixture SHA256 required');
  const config={url:ORIGIN,key,ownerToken,otherToken,ownerId:owner.sub,otherId:other.sub,path,hash};
  acceptedConfigs.add(config);
  return Object.freeze(config);
}
function signedUrl(value,config) {
  const parsed=new URL(value);
  if(parsed.origin !== config.url || parsed.username || parsed.password || parsed.hash
    || decodeURIComponent(parsed.pathname) !== '/storage/v1/object/sign/'+BUCKET+'/'+config.path
    || !parsed.searchParams.get('token')) throw Error('Unexpected signed URL');
  return parsed;
}
export async function runProbe(config,{createClient,fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))}) {
  if(!acceptedConfigs.has(config)) throw Error('Validated test configuration required');
  let phase='identity';
  try {
    const guardedFetch=async (input,options={}) => {
      const target=new URL(input instanceof Request?input.url:input);
      const method=(options.method ?? (input instanceof Request?input.method:'GET')).toUpperCase();
      const path=decodeURIComponent(target.pathname);
      const object='/storage/v1/object/';
      const allowedGet=path==='/auth/v1/user' || path==='/rest/v1/profiles'
        || path===object+'authenticated/'+BUCKET+'/'+config.path
        || path===object+BUCKET+'/'+config.path;
      const allowedSign=path===object+'sign/'+BUCKET+'/'+config.path;
      if(target.origin!==config.url || target.username || target.password
        || !((method==='GET' && allowedGet)||(method==='POST' && allowedSign))) {
        throw Error('Unexpected HTTP operation');
      }
      return fetchImpl(input,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
    };
    const make = token => createClient(config.url,config.key,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:token?{Authorization:'Bearer '+token}:{},fetch:guardedFetch}
    });
    const owner=make(config.ownerToken), other=make(config.otherToken), anon=make(null);
    // Decode was only preflight. Auth server verifies each supplied user JWT.
    for(const [client,token,id] of [[owner,config.ownerToken,config.ownerId],[other,config.otherToken,config.otherId]]) {
      const result=await client.auth.getUser(token);
      if(result.error || result.data?.user?.id !== id) throw Error();
      const profile=await client.from('profiles').select('role').eq('id',id).single();
      if(profile.error || profile.data?.role !== 'student') throw Error();
    }
    phase='owner-download';
    const own=owner.storage.from(BUCKET), cross=other.storage.from(BUCKET), anonymous=anon.storage.from(BUCKET);
    const downloaded=await own.download(config.path);
    if(downloaded.error || !downloaded.data || downloaded.data.size<1 || downloaded.data.size>3*1024*1024) throw Error();
    if(createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex') !== config.hash) throw Error();
    phase='cross-owner-download';
    const crossDownload=await cross.download(config.path);
    if(!deny(crossDownload.error) || crossDownload.data) throw Error();
    phase='anonymous-download';
    const anonDownload=await anonymous.download(config.path);
    if(!deny(anonDownload.error) || anonDownload.data) throw Error();
    phase='cross-owner-sign';
    const crossSign=await cross.createSignedUrl(config.path,2);
    if(!deny(crossSign.error) || crossSign.data?.signedUrl) throw Error();
    phase='anonymous-sign';
    const anonSign=await anonymous.createSignedUrl(config.path,2);
    if(!deny(anonSign.error) || anonSign.data?.signedUrl) throw Error();
    phase='owner-sign';
    const active=await own.createSignedUrl(config.path,30);
    if(active.error || !active.data?.signedUrl) throw Error();
    const activeUrl=signedUrl(active.data.signedUrl,config);
    const response=await fetchImpl(activeUrl,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw Error();
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>3*1024*1024 || createHash('sha256').update(Buffer.from(bytes)).digest('hex') !== config.hash) throw Error();
    phase='expired-cold-url';
    // Never warm this token: CDN can serve previously cached responses beyond expiry.
    const cold=await own.createSignedUrl(config.path,2);
    if(cold.error || !cold.data?.signedUrl) throw Error();
    const expiredUrl=signedUrl(cold.data.signedUrl,config);
    const payload=claims(expiredUrl.searchParams.get('token'));
    if(!Number.isSafeInteger(payload.exp)) throw Error();
    const delay=payload.exp*1000-Date.now()+2000;
    if(delay<0 || delay>15000) throw Error();
    await wait(delay);
    expiredUrl.searchParams.set('cacheNonce',randomUUID());
    const expired=await fetchImpl(expiredUrl,{redirect:'error',cache:'no-store',
      headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
    if(![400,401,403,404].includes(expired.status)) throw Error();
    return {status:'PASS',checks:7,remoteObjectWrites:0,
      scope:'two synthetic student sessions, known avatar fixture, cold signed URL expiration',
      limitations:['No upload/update/delete tested','No Admin/instructor/affiliate coverage','Cached signed URLs are not proven revoked']};
  } catch { throw Error('Storage probe failed at '+phase); }
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config=configFromEnv(process.env);
    const {createClient}=await import('@supabase/supabase-js');
    console.log(JSON.stringify(await runProbe(config,{createClient})));
  } catch(error) {
    // Never print SDK errors, URLs, tokens, object paths or downloaded content.
    console.error(JSON.stringify({status:'BLOQUEADO_OU_FAIL',detail:error.message}));
    process.exitCode=1;
  }
}
