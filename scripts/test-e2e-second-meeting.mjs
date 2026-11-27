import assert from 'node:assert/strict';
import { continueSecondMeeting, validateCheckpoint, finalBalance } from './e2e/second-meeting.mjs';
const base = 'https://example.invalid';
const now = Date.parse('2026-11-27T12:00:00Z');
const checkpoint = {
  version: 1, baseOrigin: base,
  bookingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  meetingIds: { 1: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
  secondStartsAt: '2026-11-27T12:00:00-03:00',
  firstDoneMinutes: 110, secondDoneMinutes: 115, stage: 'first-recorded',
};
function harness(options = {}) {
  let saved = structuredClone(options.checkpoint ?? checkpoint), starts = 0, records = 0;
  let status = options.status ?? 'scheduled';
  const intents = [];
  const inspect = async () => ({
    bookingId: options.bookingId ?? checkpoint.bookingId,
    first: { id: checkpoint.meetingIds[1], status: 'done', doneMinutes: options.firstMinutes ?? 110 },
    second: { id: options.secondId ?? checkpoint.meetingIds[2], status,
      canStart: options.canStart ?? true, doneMinutes: status === 'done' ? (options.secondMinutes ?? 115) : null },
  });
  return {
    options: {
      checkpoint: saved, base, inspect, now: () => now,
      persist: async (value) => {
        if (options.persistError) throw new Error('disk unavailable');
        saved = structuredClone(value); intents.push(value.stage);
      },
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
  { checkpoint: { ...checkpoint,secondStartsAt:'2026-11-30T12:00:00-03:00' } },
  { canStart:false },
  { secondId:'dddddddd-dddd-dddd-dddd-dddddddddddd' },
  { bookingId:'dddddddd-dddd-dddd-dddd-dddddddddddd' },
  { firstMinutes:109 },
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
await assert.rejects(continueSecondMeeting({...harness().options,persist:null}),/persistência/);
for (const raw of [
  {...checkpoint,baseOrigin:'https://another.invalid'},
  {...checkpoint,meetingIds:{1:checkpoint.meetingIds[1],2:checkpoint.meetingIds[1]}},
  {...checkpoint,presenceCode:'1234'},
  {...checkpoint,secondDoneMinutes:121},
  {...checkpoint,secondStartsAt:'not-a-date'},
]) assert.throws(()=>validateCheckpoint(raw,base));
console.log('PASS: second meeting resumes the same IDs, respects time/app gates, never repeats ambiguous writes; 110+115=225/240 with 15 minutes remaining.');
