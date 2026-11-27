import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {configFromEnv,runProbe,PROJECT} from './storage-readonly.mjs';
const url='https://'+PROJECT+'.supabase.co';
const owner='00000000-0000-0000-0000-0000000000b1',other='00000000-0000-0000-0000-0000000000b2';
const token=c=>'e30.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.test-signature';
const user=id=>token({sub:id,role:'authenticated',iss:url+'/auth/v1',exp:Math.floor(Date.now()/1000)+3600});
const bytes=Buffer.from('synthetic fixture only');
const env=()=>({STORAGE_TEST_CONFIRM_SYNTHETIC:'sim',STORAGE_TEST_URL:url,
  STORAGE_TEST_PUBLISHABLE_KEY:'sb_publishable_test',STORAGE_TEST_OWNER_JWT:user(owner),
  STORAGE_TEST_OTHER_JWT:user(other),STORAGE_TEST_FIXTURE_PATH:owner+'/e2e-storage/fixture.png',
  STORAGE_TEST_FIXTURE_SHA256:createHash('sha256').update(bytes).digest('hex')});
function harness({deniedStatus=403,identity=owner,crossCanSign=false,expiredStatus=403}={}) {
  const seen=[],clients=[];
  const createClient=(_url,_key,options)=>{
    const n=clients.length;
    const client={
      auth:{async getUser(){return {data:{user:{id:n===0?identity:other}},error:null};}},
      from(){return {select(){return this;},eq(){return this;},async single(){return {data:{role:'student'},error:null};}}},
      storage:{from(){return {
        async download(){return n===0?{data:new Blob([bytes]),error:null}:{data:null,error:{statusCode:deniedStatus}};},
        async createSignedUrl(path,ttl){
          if(n!==0&&!crossCanSign)return {data:null,error:{statusCode:deniedStatus}};
          return {data:{signedUrl:url+'/storage/v1/object/sign/vento-student-avatars/'+path+'?token='+token({exp:Math.floor(Date.now()/1000)+ttl})},error:null};
        }
      };}}
    };
    clients.push({client,options});
    return client;
  };
  const fetchImpl=async (input,options)=>{
    seen.push({url:new URL(input),options});
    return seen.length===1?new Response(bytes):new Response('',{status:expiredStatus});
  };
  return {createClient,fetchImpl,wait:async ms=>assert.ok(ms>0&&ms<=15000),seen,clients};
}
test('configuration rejects other projects, privileged credentials and same account',()=>{
  for(const change of [
    {STORAGE_TEST_URL:'https://turiva.supabase.co'},
    {STORAGE_TEST_CONFIRM_SYNTHETIC:''},
    {STORAGE_TEST_PUBLISHABLE_KEY:'sb_secret_not-allowed'},
    {STORAGE_TEST_PUBLISHABLE_KEY:token({role:'service_role',ref:PROJECT})},
    {STORAGE_TEST_OWNER_JWT:token({sub:owner,role:'service_role',iss:url+'/auth/v1',exp:Math.floor(Date.now()/1000)+3600})},
    {STORAGE_TEST_OTHER_JWT:user(owner)},
    {STORAGE_TEST_FIXTURE_PATH:other+'/fixture.png'},
    {STORAGE_TEST_FIXTURE_PATH:owner+'/../fixture.png'},
    {STORAGE_TEST_FIXTURE_SHA256:''}
  ])assert.throws(()=>configFromEnv({...env(),...change}));
});
test('owner, cross-owner, anon, signing and cold expiration complete without writes',async()=>{
  const h=harness();
  const result=await runProbe(configFromEnv(env()),h);
  assert.equal(result.status,'PASS');
  assert.equal(result.remoteObjectWrites,0);
  assert.equal(result.checks,7);
  assert.equal(h.seen.length,2);
  assert.equal(h.seen[0].url.searchParams.has('cacheNonce'),false);
  assert.equal(h.seen[1].url.searchParams.has('cacheNonce'),true);
  assert.ok(h.seen.every(r=>r.options.redirect==='error'&&r.options.cache==='no-store'));
});
test('network outage, unauthorized signing and expired URL still returning bytes cannot pass',async()=>{
  for(const options of [{deniedStatus:500},{crossCanSign:true},{expiredStatus:200}]) {
    await assert.rejects(()=>runProbe(configFromEnv(env()),harness(options)));
  }
});
test('verified identity mismatch and fixture hash mismatch stop the probe',async()=>{
  await assert.rejects(()=>runProbe(configFromEnv(env()),harness({identity:other})),/identity/);
  await assert.rejects(()=>runProbe(configFromEnv({...env(),STORAGE_TEST_FIXTURE_SHA256:'0'.repeat(64)}),harness()),/owner-download/);
});
test('SDK network guard forbids writes, foreign hosts and redirect following',async()=>{
  const h=harness();
  await runProbe(configFromEnv(env()),h);
  const guarded=h.clients[0].options.global.fetch;
  await assert.rejects(()=>guarded(url+'/storage/v1/object/vento-student-avatars/'+owner+'/e2e-storage/fixture.png',{method:'PUT'}));
  await assert.rejects(()=>guarded('https://other.invalid/auth/v1/user'));
  await assert.rejects(()=>runProbe({...configFromEnv(env()),url:'https://other.invalid'},h));
});
