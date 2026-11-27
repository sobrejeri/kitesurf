#!/usr/bin/env node
// Standalone trusted worker. Never imported by src/ or shipped to the browser.
// No scheduler is installed. Default disabled; enabled without DRY_RUN=false previews only.
import {pathToFileURL} from 'node:url';
import {dispatcherConfig,dispatchBatch,safeError} from './core.mjs';
import {createWebPushTransport} from './transport.mjs';
export function createRepository(config,env,fetchImpl=fetch){
  const secret=env.PUSH_SUPABASE_SERVICE_KEY;
  if(typeof secret!=='string'||secret.length<32)throw safeError('MISSING_WORKER_CREDENTIAL');
  const rpc=async(name,body)=>{
    let response;
    try{
      response=await fetchImpl(config.url+'/rest/v1/rpc/'+name,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),
        headers:{'Content-Type':'application/json',apikey:secret,Authorization:'Bearer '+secret},
        body:JSON.stringify(body),
      });
    }catch{throw safeError('RPC_NETWORK_FAILED');}
    if(!response.ok)throw safeError('RPC_REJECTED_'+response.status);
    try{return await response.json();}catch{throw safeError('RPC_INVALID_RESPONSE');}
  };
  return{
    preview:p_activation=>rpc('preview_push_dispatch',{p_activation}),
    claim:p_activation=>rpc('claim_push_dispatch',{p_activation}),
    prepare:(lease,p_activation)=>rpc('prepare_push_dispatch',{p_id:lease.id,p_lease:lease.leaseToken,p_activation}),
    settle:(lease,result)=>rpc('settle_push_dispatch',{p_id:lease.id,p_lease:lease.leaseToken,
      p_outcome:result.outcome,p_status:result.status,p_retry_after:result.retryAfter}),
  };
}
export async function main(env=process.env,{fetchImpl=fetch,transport=createWebPushTransport}={}){
  const config=dispatcherConfig(env);
  if(!config.enabled)return dispatchBatch({config});
  // Validate VAPID before claiming anything. Dry-run never reads private VAPID.
  const send=config.dryRun?undefined:await transport(env);
  return dispatchBatch({config,repository:createRepository(config,env,fetchImpl),send});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await main()));}
  catch(error){console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:'DISPATCH_FAILED'}));process.exitCode=1;}
}
