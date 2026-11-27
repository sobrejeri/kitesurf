import assert from 'node:assert/strict';
import { continueSecondMeeting, validateCheckpoint, finalBalance } from './e2e/second-meeting.mjs';
const base = 'https://example.invalid';
const now = Date.parse('2026-11-27T12:00:00Z');
const checkpoint = {
  version: 2, revision:0, baseOrigin: base, requestId:'dddddddd-dddd-dddd-dddd-dddddddddddd',
  bookingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  meetingIds: { 1: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
  secondStartsAt: '2026-11-27T15:00:00.000Z',
  firstDoneMinutes: 110, secondDoneMinutes: 115, stage: 'first-recorded',
};
function harness(options = {}) {
  let saved = structuredClone(options.checkpoint ?? checkpoint), starts = 0, records = 0;
  let status = options.status ?? 'scheduled';
  const intents = [];
  let leased=false;
  const inspect = async () => ({
    bookingId: options.bookingId ?? checkpoint.bookingId,
    first: { id: checkpoint.meetingIds[1], status: 'done', doneMinutes: options.firstMinutes ?? 110 },
    second: { id: options.secondId ?? checkpoint.meetingIds[2], status,
      canStart: options.canStart ?? true, startsAt:options.actualStartsAt ?? saved.secondStartsAt, doneMinutes: status === 'done' ? (options.secondMinutes ?? 115) : null },
  });
  return {
    options: {
      checkpoint: saved, base, inspect, now: () => now,
      verifyRequest:async()=>({baseOrigin:base,requestId:options.requestId ?? saved.requestId,bookingId:saved.bookingId}),
      checkpointStore:{withLease:async(expected,origin,fn)=>{
        if(leased)throw Object.assign(new Error('checkpoint locked'),{code:'E2E_BLOCKED'});
        leased=true;
        try{return await fn({read:()=>structuredClone(saved),compareAndSwap:async(previous,value)=>{
          if(options.persistError)throw new Error('disk unavailable');
          assert.deepEqual(previous,saved);assert.equal(value.revision,saved.revision+1);
          saved=structuredClone(value);intents.push(value.stage);
        }});}finally{leased=false;}
      }},
      start: async () => {
        assert.equal(saved.stage,'second-start-attempted');
        starts += 1; if (!options.startUnchanged) status = 'in_progress';
        if (options.startError) throw new Error('start response lost');
      },
      record: async (minutes) => {
        assert.equal(minutes,115); assert.equal(saved.stage,'second-record-attempted');
        records += 1; if (!options.recordUnchanged) status = 'done';
        if (options.recordError) throw new Error('record response lost');
      },
    },
    state: () => ({ starts,records,saved,intents }),
  };
}
assert.deepEqual(finalBalance(110,115), { done:225,scheduled:0,available:15 });
const happy = harness();
assert.equal((await continueSecondMeeting(happy.options)).stage,'complete');
assert.equal(happy.state().starts,1); assert.equal(happy.state().records,1);
assert.deepEqual(happy.state().intents,['second-start-attempted','second-started','second-record-attempted','complete']);
assert.equal(happy.state().saved.secondStartsAt,checkpoint.secondStartsAt);
assert.deepEqual(happy.state().saved.meetingIds,checkpoint.meetingIds);

const staged = harness();
const afterStart = await continueSecondMeeting({ ...staged.options, stopAfterStart:true });
assert.equal(afterStart.stage,'second-started');
assert.equal(staged.state().starts,1); assert.equal(staged.state().records,0);
await continueSecondMeeting({ ...staged.options, checkpoint:afterStart });
assert.equal(staged.state().starts,1); assert.equal(staged.state().records,1);

for (const config of [
  { checkpoint: { ...checkpoint,secondStartsAt:'2026-11-30T15:00:00.000Z' } },
  { canStart:false },
  { secondId:'dddddddd-dddd-dddd-dddd-dddddddddddd' },
  { bookingId:'dddddddd-dddd-dddd-dddd-dddddddddddd' },
  { firstMinutes:109 },
  {requestId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'},
  {actualStartsAt:'2026-11-27T16:00:00.000Z'},
]) {
  const h=harness(config);
  await assert.rejects(continueSecondMeeting(h.options),e=>e.code==='E2E_BLOCKED');
  assert.equal(h.state().starts,0); assert.equal(h.state().records,0);
}
const lostStart = harness({startError:true});
await assert.rejects(continueSecondMeeting(lostStart.options),/response lost/);
await continueSecondMeeting({ ...lostStart.options,checkpoint:lostStart.state().saved });
assert.equal(lostStart.state().starts,1); assert.equal(lostStart.state().records,1);
const unchangedStart = harness({startUnchanged:true});
await assert.rejects(continueSecondMeeting(unchangedStart.options),/não repetir/);
await assert.rejects(continueSecondMeeting({...unchangedStart.options,checkpoint:unchangedStart.state().saved}),/não repetir/);
assert.equal(unchangedStart.state().starts,1); assert.equal(unchangedStart.state().records,0);

const lostRecord = harness({recordError:true});
await assert.rejects(continueSecondMeeting(lostRecord.options),/response lost/);
assert.equal((await continueSecondMeeting({...lostRecord.options,checkpoint:lostRecord.state().saved})).stage,'complete');
assert.equal(lostRecord.state().starts,1); assert.equal(lostRecord.state().records,1);
const unchangedRecord = harness({recordUnchanged:true});
await assert.rejects(continueSecondMeeting(unchangedRecord.options),/registro ainda não comprovado/);
await assert.rejects(continueSecondMeeting({...unchangedRecord.options,checkpoint:unchangedRecord.state().saved}),/não repetir/);
assert.equal(unchangedRecord.state().starts,1); assert.equal(unchangedRecord.state().records,1);

const done = harness({status:'done'});
await continueSecondMeeting(done.options);
assert.equal(done.state().starts,0); assert.equal(done.state().records,0);
const wrongDone = harness({status:'done',secondMinutes:114});
await assert.rejects(continueSecondMeeting(wrongDone.options),/divergem/);
const noDisk = harness({persistError:true});
await assert.rejects(continueSecondMeeting(noDisk.options),/disk unavailable/);
assert.equal(noDisk.state().starts,0); assert.equal(noDisk.state().records,0);
await assert.rejects(continueSecondMeeting({...harness().options,checkpointStore:null}),/lock e CAS/);
await assert.rejects(continueSecondMeeting({...harness().options,verifyRequest:null}),/revalidar/);
for (const raw of [
  {...checkpoint,baseOrigin:'https://another.invalid'},
  {...checkpoint,meetingIds:{1:checkpoint.meetingIds[1],2:checkpoint.meetingIds[1]}},
  {...checkpoint,presenceCode:'1234'},
  {...checkpoint,secondDoneMinutes:121},
  {...checkpoint,secondStartsAt:'not-a-date'},
]) assert.throws(()=>validateCheckpoint(raw,base));
console.log('PASS: second meeting resumes the same IDs, respects time/app gates, never repeats ambiguous writes; 110+115=225/240 with 15 minutes remaining.');

// Exercise the actual DOM adapter against a small stateful page model, not only
// the injected protocol callbacks. Every navigation must retain explicit IDs.
import { secondMeetingBrowserAdapter } from './e2e/second-meeting.mjs';
function browserModel({ wrongForm = false, wrongDomId = false, wrongDate=false,canStart = true } = {}) {
  const state = { second:'scheduled', done:0, input:null, code:null, clicks:[],urls:[] };
  let current = { position:1, tab:'concluidas' };
  const locator = ({ count=1, value=null, text=null, fill,click,check, id=null } = {}) => ({
    count:async()=>count, inputValue:async()=>value, innerText:async()=>text, waitFor:async()=>{},
    getAttribute:async()=>id, fill:async(v)=>fill?.(v), click:async()=>click?.(),check:async()=>check?.(),
  });
  const card = (position) => ({
    count:async()=>1,
    getAttribute:async(name)=>name==='data-meeting-starts-at'?(wrongDate?'2026-11-27T16:00:00.000Z':checkpoint.secondStartsAt): 'aula-'+(wrongDomId && position===2 ? checkpoint.meetingIds[1] : checkpoint.meetingIds[position]),
    getByText(label,{exact}) {
      assert.equal(label,'Tempo realizado');assert.equal(exact,true);
      return {...locator(), locator(parent) {
        assert.equal(parent,'..'); return { locator(tag) {
          assert.equal(tag,'strong');return locator({text:position===1?'1h 50min':'1h 55min'});
        }};
      }};
    },
    locator(selector) {
      if (selector.includes('form:has(input[name="presenceCode"])')) {
        return locator({count:canStart?1:0,value:wrongForm?checkpoint.meetingIds[1]:checkpoint.meetingIds[2]});
      }
      if (selector.includes('form:has(input[name="doneMinutes"])')) {
        return locator({value:wrongForm?checkpoint.meetingIds[1]:checkpoint.meetingIds[2]});
      }
      if (selector==='input[name="presenceCode"]') return locator({fill:v=>{state.code=v;}});
      if (selector==='input[name="doneMinutes"]') return locator({fill:v=>{state.input=v;}});
      if (selector.startsWith('input[type="radio"]')) return locator({check:()=>{}});
      throw new Error('unexpected card selector '+selector);
    },
    getByRole(role,{name,exact}) {
      assert.equal(role,'button');assert.equal(exact,true);
      return locator({click:()=>{
        assert.equal(position,2,'the first meeting must never be clicked on resume');
        state.clicks.push(name);
        if (name==='Confirmar presença e iniciar') {
          assert.equal(state.code,'1234');state.second='in_progress';
        } else if(name==='Concluir e registrar encontro') {
          assert.equal(state.input,'115');state.second='done';state.done=115;
        } else throw new Error('unexpected button '+name);
      }});
    },
  });
  return {state,page:{
    url:()=>state.urls.at(-1),
    goto:async(url)=>{
      state.urls.push(url);const u=new URL(url);
      const position=Object.entries(checkpoint.meetingIds).find(([,id])=>id===u.searchParams.get('aula'))?.[0];
      assert.ok(position,'navigation must retain a checkpoint meeting UUID');
      current={position:Number(position),tab:u.searchParams.get('aba')};
    },
    locator(selector) {
      assert.ok(selector.includes('[data-booking-id="'+checkpoint.bookingId+'"]'));
      const position=Number(/data-meeting-position="(\d+)"/.exec(selector)?.[1]);
      assert.equal(position,current.position);
      const actualStatus=position===1?'done':state.second;
      const tabStatus={concluidas:'done',andamento:'in_progress',proximas:'scheduled'}[current.tab];
      return actualStatus===tabStatus?card(position):locator({count:0});
    },
  }};
}
const actualAdapter=browserModel();
const adapterArgs=secondMeetingBrowserAdapter({page:actualAdapter.page,base,checkpoint,code:'1234'});
await continueSecondMeeting({...harness().options,...adapterArgs,base,checkpoint,now:()=>now});
assert.deepEqual(actualAdapter.state.clicks,['Confirmar presença e iniciar','Concluir e registrar encontro']);
assert.equal(actualAdapter.state.done,115);
for (const config of [{wrongForm:true},{wrongDomId:true},{wrongDate:true},{canStart:false}]) {
  const model=browserModel(config);
  const io=secondMeetingBrowserAdapter({page:model.page,base,checkpoint,code:'1234'});
  await assert.rejects(continueSecondMeeting({...harness().options,...io,base,checkpoint,now:()=>now}),e=>e.code==='E2E_BLOCKED');
  assert.deepEqual(model.state.clicks,[]);
}
console.log('PASS: browser adapter retains booking/meeting IDs and never submits a mismatched form.');

