import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dispatcherConfig,payloadForJob,classifyResult,dispatchBatch} from './push-dispatcher/core.mjs';
import {publicAddress,guardedLookup,createWebPushTransport} from './push-dispatcher/transport.mjs';
import {main,createRepository} from './push-dispatcher/run.mjs';
import * as webpush from './push-dispatcher/node_modules/web-push/src/index.js';
const id='96111111-1111-4111-8111-111111111111';
const token='96222222-2222-4222-8222-222222222222';
const notice='96333333-3333-4333-8333-333333333333';
const ecdh=createECDH('prime256v1');ecdh.generateKeys();
const job={id,notificationId:notice,href:'/aluno/avisos',ttl:120,
 subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-only',
 keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},
 title:'PRIVATE NAME',body:'PRIVATE CHAT',ownerId:'PRIVATE OWNER'};
const config={enabled:true,dryRun:false,activatedAt:'2026-11-26T00:00:00Z',limit:25};
let touched=0;
const forbiddenEnv=new Proxy({PUSH_DISPATCH_ENABLED:'false'},{get(target,key){if(key==='PUSH_DISPATCH_ENABLED')return target[key];throw new Error('disabled read private configuration');}});
assert.equal(dispatcherConfig(forbiddenEnv).enabled,false);
assert.equal((await main(forbiddenEnv,{fetchImpl:()=>{touched++;},transport:()=>{touched++;}})).claimed,0);
assert.equal(touched,0);
const configured={PUSH_DISPATCH_ENABLED:'true',PUSH_SUPABASE_URL:'https://qadkqjfmmnxvovyyhqxw.supabase.co',
 PUSH_DISPATCH_PROJECT_REF:'qadkqjfmmnxvovyyhqxw',PUSH_DISPATCH_ACTIVATED_AT:'2026-11-26T00:00:00Z',PUSH_SUPABASE_SERVICE_KEY:'synthetic-secret-never-real'.repeat(2)};
assert.equal(dispatcherConfig(configured).dryRun,true);
assert.throws(()=>dispatcherConfig({...configured,PUSH_SUPABASE_URL:'https://attacker.invalid'}));
let requests=[];
const previewFetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({enabled:false,pending:3,unknown:0,accepted:0})};};
const dry=await main(new Proxy(configured,{get(t,k){if(String(k).startsWith('PUSH_VAPID'))throw Error('dry-run read VAPID');return t[k];}}),
 {fetchImpl:previewFetch,transport:()=>{throw Error('dry-run created transport');}});
assert.equal(dry.dryRun,true);assert.equal(requests.length,1);
assert.ok(requests[0].url.endsWith('/rpc/preview_push_dispatch'));
assert.equal(requests[0].options.redirect,'error');
const minimal=payloadForJob(job);
assert.deepEqual(JSON.parse(minimal.payload),{notificationId:notice,href:'/aluno/avisos'});
assert.ok(!minimal.payload.includes('PRIVATE'));
assert.equal(payloadForJob(job).topic,minimal.topic);assert.equal(minimal.topic.length,32);
assert.notEqual(payloadForJob({...job,notificationId:id}).topic,minimal.topic);
for(const endpoint of ['https://localhost/token','https://127.0.0.1/token','http://fcm.googleapis.com/token',
 'https://user@fcm.googleapis.com/token','https://fcm.googleapis.com:444/token','https://fcm.googleapis.com/token#secret']){
 assert.throws(()=>payloadForJob({...job,subscription:{...job.subscription,endpoint}}));
}
for(const href of ['https://attacker.invalid','/api/private','/aluno/reserva/'+id,'//fcm.googleapis.com/token'])assert.throws(()=>payloadForJob({...job,href}));
assert.throws(()=>payloadForJob({...job,subscription:{...job.subscription,keys:{...job.subscription.keys,p256dh:'BA'+ 'A'.repeat(85)}}}));
for(const [status,outcome]of [[201,'accepted'],[404,'gone'],[410,'gone'],[429,'retry'],[503,'retry'],[400,'dead'],[401,'dead'],[302,'dead'],[202,'unknown']]){
 assert.equal(classifyResult({statusCode:status}).outcome,outcome);
}
assert.equal(classifyResult(new Error('network timeout')).outcome,'unknown');
assert.equal(classifyResult({statusCode:429,headers:{'retry-after':'7200'}}).retryAfter,3600);
assert.equal(classifyResult({statusCode:503,headers:{'retry-after':'60'}}).retryAfter,60);
assert.equal(classifyResult({statusCode:503,headers:{'retry-after':'2026-11-26T00:01:00Z'}},Date.parse('2026-11-26T00:00:00Z')).retryAfter,60);
for(const address of ['127.0.0.1','10.1.1.1','169.254.169.254','100.64.0.1','192.168.1.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:a00:1::']){
 assert.equal(publicAddress(address),false,address);
}
assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
const resolve=(addresses,hostname='fcm.googleapis.com')=>new Promise((resolve,reject)=>guardedLookup('fcm.googleapis.com',(_h,_o,cb)=>cb(null,addresses))(hostname,{all:true},(error,value)=>error?reject(error):resolve(value)));
await assert.rejects(resolve([{address:'127.0.0.1',family:4}]));
await assert.rejects(resolve([{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
await assert.rejects(resolve([{address:'8.8.8.8',family:4}],'attacker.invalid'));
assert.deepEqual(await resolve([{address:'8.8.8.8',family:4}]),[{address:'8.8.8.8',family:4}]);

function repository({status=201,settleError=false,jobOverride=job}={}){
 let claimed=false,prepared=false,sent=0;const outcomes=[];
 return{outcomes,get sent(){return sent;},repo:{
 preview:async()=>({pending:1}),
 claim:async()=>{if(claimed)return null;claimed=true;return{id,leaseToken:token};},
 prepare:async()=>{if(prepared)throw Error('prepare replay');prepared=true;return jobOverride;},
 settle:async(lease,result)=>{assert.equal(lease.leaseToken,token);if(settleError)throw Error('settle lost');outcomes.push(result);},
 },send:async(value)=>{sent++;assert.ok(!value.payload.includes('PRIVATE'));return{statusCode:status};}};
}
const accepted=repository();const summary=await dispatchBatch({config,repository:accepted.repo,send:accepted.send});
assert.equal(summary.accepted,1);assert.equal(accepted.sent,1);
const duplicate=repository();
await Promise.all([dispatchBatch({config,repository:duplicate.repo,send:duplicate.send}),dispatchBatch({config,repository:duplicate.repo,send:duplicate.send})]);
assert.equal(duplicate.sent,1,'atomic repository claim fences two dispatchers');
const retry=repository({status:429});await dispatchBatch({config,repository:retry.repo,send:retry.send});assert.equal(retry.outcomes[0].outcome,'retry');
const gone=repository({status:410});await dispatchBatch({config,repository:gone.repo,send:gone.send});assert.equal(gone.outcomes[0].outcome,'gone');
const uncertain=repository();await dispatchBatch({config,repository:uncertain.repo,send:async()=>{throw Error('lost response');}});assert.equal(uncertain.outcomes[0].outcome,'unknown');
const mismatch=repository({jobOverride:{...job,id:token}});
await dispatchBatch({config,repository:mismatch.repo,send:mismatch.send});assert.equal(mismatch.sent,0);assert.equal(mismatch.outcomes[0].outcome,'dead');
const lostSettlement=repository({settleError:true});await assert.rejects(dispatchBatch({config,repository:lostSettlement.repo,send:lostSettlement.send}),/settle lost/);assert.equal(lostSettlement.sent,1);
const cancelled=repository({jobOverride:null});const skipped=await dispatchBatch({config,repository:cancelled.repo,send:cancelled.send});assert.equal(skipped.skipped,1);assert.equal(cancelled.sent,0);
assert.throws(()=>createRepository({url:'https://example.invalid'},{PUSH_SUPABASE_SERVICE_KEY:'x'},previewFetch));
const vapid=webpush.generateVAPIDKeys();let encrypted=false;
const send=await createWebPushTransport({PUSH_VAPID_SUBJECT:'mailto:test@example.invalid',PUSH_VAPID_PUBLIC_KEY:vapid.publicKey,PUSH_VAPID_PRIVATE_KEY:vapid.privateKey},{
 load:async()=>({...webpush,sendNotification:async(subscription,payload,options)=>{
   const details=webpush.generateRequestDetails(subscription,payload,options);
   assert.ok(Buffer.isBuffer(details.body));assert.ok(details.body.length>Buffer.byteLength(payload));
   assert.equal(options.contentEncoding,'aes128gcm');assert.equal(options.TTL,120);
   assert.equal(options.proxy,undefined);assert.ok(options.agent);
   encrypted=true;return{statusCode:201};
 }}),
});
await send(minimal);assert.ok(encrypted,'real pinned library encrypted payload without HTTP');
const source=readFileSync(new URL('./push-dispatcher/node_modules/web-push/src/web-push-lib.js',import.meta.url),'utf8');
assert.ok(source.includes('https.request('));assert.ok(!source.includes('follow-redirects'),'pinned sender does not follow redirects');
console.log('PASS: push dispatcher OFF/dry-run/privacy/endpoint+DNS gates/claims/retry/gone/ambiguous outcomes; real encryption with mocked transport, zero push HTTP.');
