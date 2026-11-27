import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createCheckpointStore } from './e2e/checkpoint-store.mjs';
import { continueSecondMeeting } from './e2e/second-meeting.mjs';
import { createWriteEvidence } from './e2e/write-evidence.mjs';

const base='https://example.invalid';
const checkpoint={version:2,revision:0,baseOrigin:base,requestId:'dddddddd-dddd-dddd-dddd-dddddddddddd',
  bookingId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',meetingIds:{1:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',2:'cccccccc-cccc-cccc-cccc-cccccccccccc'},
  secondStartsAt:'2026-11-27T15:00:00.000Z',firstDoneMinutes:110,secondDoneMinutes:115,stage:'first-recorded'};
const root=mkdtempSync(join(tmpdir(),'vento-checkpoint-test-'));
const binding=async()=>({baseOrigin:base,requestId:checkpoint.requestId,bookingId:checkpoint.bookingId});
const observation=(status)=>({bookingId:checkpoint.bookingId,first:{id:checkpoint.meetingIds[1],status:'done',doneMinutes:110},
  second:{id:checkpoint.meetingIds[2],status,startsAt:checkpoint.secondStartsAt,canStart:true,doneMinutes:status==='done'?115:null}});
try {
  const path=join(root,'checkpoint.json'),copy=join(root,'copied.json'),journalDirectory=join(root,'journal');
  const store=createCheckpointStore({path,journalDirectory});
  await store.initialize(checkpoint,base);
  await assert.rejects(store.initialize(checkpoint,base),error=>error.code==='EEXIST');
  writeFileSync(copy,JSON.stringify(checkpoint),{mode:0o600});
  const other=createCheckpointStore({path:copy,journalDirectory});
  let release,entered;
  const inside=new Promise(resolve=>{entered=resolve;});
  const barrier=new Promise(resolve=>{release=resolve;});
  let status='scheduled',starts=0,records=0;
  const evidence=createWriteEvidence();
  const options={base,checkpoint,checkpointStore:store,verifyRequest:binding,evidence,now:()=>Date.parse('2026-11-27T12:00:00Z'),
    inspect:async()=>{const value=observation(status);entered();await barrier;return value;},
    start:async()=>{starts++;status='in_progress';},record:async()=>{records++;status='done';}};
  const first=continueSecondMeeting(options);
  await inside;
  await assert.rejects(continueSecondMeeting({...options,checkpointStore:other}),/já está em execução/);
  release();await first;
  assert.equal(starts,1);assert.equal(records,1);
  assert.equal(evidence.summary(true).gravacoes_comprovadas,2);
  const resumedEvidence=createWriteEvidence();
  await continueSecondMeeting({...options,checkpointStore:other,evidence:resumedEvidence});
  assert.equal(starts,1);assert.equal(records,1,'a copied stale checkpoint uses the durable authoritative journal');
  assert.equal(resumedEvidence.summary(true).gravou_dados,false,'reconciliation of previous writes is not a new write');
  await store.withLease(checkpoint,base,async lease=>{
    const previous=lease.read();
    await lease.compareAndSwap(previous,{...previous,revision:previous.revision+1});
    await assert.rejects(lease.compareAndSwap(previous,{...previous,revision:previous.revision+1}),/mudou/);
  });
  await assert.rejects(store.withLease({...checkpoint,requestId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'},base,()=>{}),/imutável/);
  await assert.rejects(store.withLease({...checkpoint,secondStartsAt:'2026-11-27T16:00:00.000Z'},base,()=>{}),/imutável/);
  await assert.rejects(createCheckpointStore({path:copy,journalDirectory:join(root,'missing')}).withLease(checkpoint,base,()=>{}),/journal.*ausente/);

  // Journal intent remains authoritative even if updating its portable mirror fails.
  const mirrorPath=join(root,'mirror.json');
  const failed=createCheckpointStore({path:mirrorPath,journalDirectory:join(root,'mirror-journal')});
  await failed.initialize(checkpoint,base);
  unlinkSync(mirrorPath);mkdirSync(mirrorPath);
  let accidental=0;
  const unknown={...options,checkpointStore:failed,inspect:async()=>observation('scheduled'),start:async()=>{accidental++;}};
  await assert.rejects(continueSecondMeeting(unknown));
  rmSync(mirrorPath,{recursive:true});writeFileSync(mirrorPath,JSON.stringify(checkpoint),{mode:0o600});
  await assert.rejects(continueSecondMeeting(unknown),/não repetir/);
  assert.equal(accidental,0);

  // Two processes, two checkpoint filenames, the same booking journal.
  const processRoot=join(root,'processes');mkdirSync(processRoot,{mode:0o700});
  const processPath=join(processRoot,'checkpoint.json'),processCopy=join(processRoot,'copy.json');
  const processJournal=join(processRoot,'journal');
  await createCheckpointStore({path:processPath,journalDirectory:processJournal}).initialize(checkpoint,base);
  writeFileSync(processCopy,JSON.stringify(checkpoint),{mode:0o600});
  writeFileSync(join(processRoot,'status'),'scheduled');
  const childCode=`
    import{readFileSync,writeFileSync,existsSync,appendFileSync}from'node:fs';
    import{join}from'node:path';
    const{createCheckpointStore}=await import(process.argv[1]);
    const{continueSecondMeeting}=await import(process.argv[2]);
    const[root,path,journal,actor]=process.argv.slice(3);
    const checkpointStore=createCheckpointStore({path,journalDirectory:journal});
    const checkpoint=checkpointStore.load('${base}');
    try{await continueSecondMeeting({checkpoint,checkpointStore,base:'${base}',now:()=>Date.parse('2026-11-27T12:00:00Z'),
      verifyRequest:async()=>({baseOrigin:checkpoint.baseOrigin,requestId:checkpoint.requestId,bookingId:checkpoint.bookingId}),
      inspect:async()=>{const status=readFileSync(join(root,'status'),'utf8');
        if(actor==='A'&&!existsSync(join(root,'entered'))){writeFileSync(join(root,'entered'),'1');
          for(let i=0;!existsSync(join(root,'release'));i++){if(i>250)throw Error('barrier timeout');await new Promise(r=>setTimeout(r,20));}}
        return{bookingId:checkpoint.bookingId,first:{id:checkpoint.meetingIds[1],status:'done',doneMinutes:110},
          second:{id:checkpoint.meetingIds[2],status,startsAt:checkpoint.secondStartsAt,canStart:true,doneMinutes:status==='done'?115:null}};},
      start:async()=>{appendFileSync(join(root,'clicks'),'start\\n');writeFileSync(join(root,'status'),'in_progress');},
      record:async()=>{appendFileSync(join(root,'clicks'),'record\\n');writeFileSync(join(root,'status'),'done');}});
      console.log('complete');}catch(e){if(e.code!=='E2E_BLOCKED')throw e;console.log('blocked');}
  `;
  const launch=(path,actor)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',childCode,new URL('./e2e/checkpoint-store.mjs',import.meta.url).href,
      new URL('./e2e/second-meeting.mjs',import.meta.url).href,processRoot,path,processJournal,actor],{stdio:['ignore','pipe','pipe']});
    return new Promise((resolve,reject)=>{let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
      child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(new Error(err)));});
  };
  const a=launch(processPath,'A');
  for(let i=0;!existsSync(join(processRoot,'entered'));i++){if(i>250)throw Error('child did not acquire lock');await new Promise(r=>setTimeout(r,20));}
  assert.equal(await launch(processCopy,'B'),'blocked');
  writeFileSync(join(processRoot,'release'),'1');
  assert.equal(await a,'complete');
  assert.deepEqual(readFileSync(join(processRoot,'clicks'),'utf8').trim().split('\n'),['start','record']);

  const report=createWriteEvidence();
  assert.equal(report.summary(true).gravou_dados,false,'flags never prove an application write');
  const attempt=report.attempt('P2',{requestId:checkpoint.requestId});
  assert.equal(report.summary(true).tentativas_sem_confirmacao,1);
  assert.throws(()=>report.confirm(Symbol()),/sem tentativa/);
  assert.throws(()=>report.confirm(attempt,{requestId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'}),/divergiu/);
  report.confirm(attempt,{bookingId:checkpoint.bookingId});
  assert.equal(report.summary(true).gravou_dados,true);
  console.log('PASS: real filesystem lock/CAS, copied checkpoint and cross-process exclusion, durable unknown intent, immutable request/date and evidence-only reporting');
} finally { rmSync(root,{recursive:true,force:true}); }
