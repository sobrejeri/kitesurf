import { createHash, ECDH } from 'node:crypto';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ENDPOINT=/^https:\/\/(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[A-Za-z0-9_~.!$&'()*+,;=:@%/?-]+$/;
const DESTINATIONS=new Set(['/aluno/avisos','/instrutor/avisos','/admin/avisos','/afiliado/inicio']);
export const safeError=(code)=>Object.assign(new Error(code),{code});
export function dispatcherConfig(env) {
  if (env.PUSH_DISPATCH_ENABLED!=='true') return {enabled:false,dryRun:true};
  const dryRun=env.PUSH_DISPATCH_DRY_RUN!=='false';
  const ref=env.PUSH_DISPATCH_PROJECT_REF;
  const url=env.PUSH_SUPABASE_URL;
  if (!/^[a-z]{20}$/.test(ref??'') || url!=='https://'+ref+'.supabase.co') throw safeError('INVALID_PROJECT');
  const activatedAt=env.PUSH_DISPATCH_ACTIVATED_AT;
  if (!Number.isFinite(Date.parse(activatedAt)) || Date.parse(activatedAt)>Date.now()) throw safeError('INVALID_ACTIVATION');
  const limit=Number(env.PUSH_DISPATCH_LIMIT??25);
  if (!Number.isSafeInteger(limit)||limit<1||limit>100) throw safeError('INVALID_LIMIT');
  return {enabled:true,dryRun,url,activatedAt,limit};
}
export function payloadForJob(job) {
  if (!job || !UUID.test(job.id??'') || !UUID.test(job.notificationId??'')
    || !DESTINATIONS.has(job.href) || !Number.isSafeInteger(job.ttl)||job.ttl<1||job.ttl>900) throw safeError('INVALID_JOB');
  const s=job.subscription;
  if (!s || typeof s.endpoint!=='string'||s.endpoint.length>2048||!ENDPOINT.test(s.endpoint)
    || new URL(s.endpoint).href!==s.endpoint) throw safeError('INVALID_SUBSCRIPTION');
  const key=(value,size)=>{
    if (typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)) throw safeError('INVALID_SUBSCRIPTION');
    const decoded=Buffer.from(value,'base64url');
    if(decoded.length!==size||decoded.toString('base64url')!==value) throw safeError('INVALID_SUBSCRIPTION');
    return decoded;
  };
  const pk=key(s.keys?.p256dh,65);key(s.keys?.auth,16);
  if(pk[0]!==4)throw safeError('INVALID_SUBSCRIPTION');
  try {ECDH.convertKey(pk,'prime256v1',undefined,undefined,'uncompressed');}catch{throw safeError('INVALID_SUBSCRIPTION');}
  return {
    subscription:{endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}},
    payload:JSON.stringify({notificationId:job.notificationId,href:job.href}),
    ttl:job.ttl,
    topic:createHash('sha256').update(job.notificationId).digest('base64url').slice(0,32),
  };
}
export function classifyResult(result,now=Date.now()) {
  const status=Number.isSafeInteger(result?.statusCode)?result.statusCode:null;
  if(status===201)return {outcome:'accepted',status,retryAfter:0};
  if(status===404||status===410)return {outcome:'gone',status,retryAfter:0};
  if([408,429,500,502,503,504].includes(status)){
    const value=result?.headers?.['retry-after'];
    let seconds=0;
    if(typeof value==='string'){
      if(/^\d+$/.test(value))seconds=Number(value);
      else {const date=Date.parse(value);if(Number.isFinite(date))seconds=Math.ceil((date-now)/1000);}
    }
    return {outcome:'retry',status,retryAfter:Math.max(0,Math.min(3600,Number.isFinite(seconds)?seconds:3600))};
  }
  if(status!==null&&status>=300&&status<=499)return {outcome:'dead',status,retryAfter:0};
  // A lost socket, timeout or unrecognized success must not trigger a blind resend.
  return {outcome:'unknown',status,retryAfter:0};
}
export async function dispatchBatch({config,repository,send}) {
  const summary={enabled:config.enabled,dryRun:true,claimed:0,accepted:0,retry:0,gone:0,dead:0,unknown:0,skipped:0};
  if(!config.enabled)return summary;
  if(config.dryRun){summary.preview=await repository.preview(config.activatedAt);return summary;}
  if(typeof send!=='function')throw safeError('MISSING_TRANSPORT');
  summary.dryRun=false;
  for(let i=0;i<config.limit;i+=1){
    const lease=await repository.claim(config.activatedAt);
    if(!lease)break;
    if(!UUID.test(lease.id??'')||!UUID.test(lease.leaseToken??''))throw safeError('INVALID_LEASE');
    summary.claimed+=1;
    // DB prepare atomically revalidates owner/session/revocation/expiry, fences
    // this token and persists attempt intent before any outgoing HTTP request.
    const job=await repository.prepare(lease,config.activatedAt);
    if(!job){summary.skipped+=1;continue;}
    let result;
    try {
      if(job.id!==lease.id)throw safeError('INVALID_JOB');
      result=await send(payloadForJob(job));
    }catch(error){
      result=error?.code==='INVALID_JOB'||error?.code==='INVALID_SUBSCRIPTION'
        ?{statusCode:400}:error;
    }
    const decision=classifyResult(result);
    // Settlement failure stops this process. It must not claim/send this job
    // again: an expired prepared lease becomes terminal 'unknown' in the DB.
    await repository.settle(lease,decision);
    summary[decision.outcome]+=1;
  }
  return summary;
}
