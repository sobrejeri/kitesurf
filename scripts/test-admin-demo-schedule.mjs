import assert from 'node:assert/strict';
import { explainAdminDemoSchedule } from '../src/lib/admin-test-schedule.ts';

function slot(starts_at, hours=2) {
  return { starts_at, hours, epoch: Date.parse(starts_at) };
}
const inputs = [
  slot('2026-11-03T11:00:00-03:00'),
  slot('2026-11-05T11:00:00-03:00'),
];
const base = {
  configured: true, bufferMinutes: 15,
  weekly: [
    {weekday:2,opens_at:'09:00:00',closes_at:'17:00:00'},
    {weekday:4,opens_at:'09:00:00',closes_at:'17:00:00'},
  ], timeOff:[], booked:[],
};
const nowMs=Date.parse('2026-11-02T12:00:00-03:00');
assert.deepEqual(explainAdminDemoSchedule(inputs,base,nowMs),[],
  'No false rejection for two distinct available days');

const weekly=explainAdminDemoSchedule(inputs,
  {...base,weekly:[base.weekly[0]]},nowMs);
assert.equal(weekly.length,1);
assert.match(weekly[0],/Encontro 2.*não atende às quinta-feira/);

const out=explainAdminDemoSchedule([
  slot('2026-11-03T16:00:00-03:00',2)
],base,nowMs);
assert.equal(out.length,1);
assert.match(out[0],/fora do turno cadastrado \(09:00–17:00\)/);

const blocked=explainAdminDemoSchedule(inputs,{
  ...base, timeOff:[{
    starts_at:'2026-11-05T11:30:00-03:00',
    ends_at:'2026-11-05T12:30:00-03:00',
  }],
},nowMs);
assert.equal(blocked.length,1);
assert.match(blocked[0],/Encontro 2.*bloqueou esse período/);

const confirmed = {
  code:'VNT-TEST-1002',starts_at:'2026-11-03T11:00:00-03:00',
  minutes:120,status:'confirmed',
  booking_created_at:'2026-11-01T09:00:00-03:00',
};
const collision=explainAdminDemoSchedule(inputs,{
  ...base,booked:[confirmed],
},nowMs);
assert.equal(collision.length,1);
assert.match(collision[0],/Encontro 1.*VNT-TEST-1002/);

const buffer=explainAdminDemoSchedule([
  slot('2026-11-03T13:10:00-03:00',1)
],{...base, booked:[confirmed]},nowMs);
assert.equal(buffer.length,1);
assert.match(buffer[0],/conflito com a reserva/);

const hold={...confirmed,status:'awaiting_payment',booking_created_at:'2026-11-02T11:40:00-03:00'};
assert.deepEqual(explainAdminDemoSchedule(inputs,{
  ...base,booked:[hold],
},nowMs),[], 'Expired unpaid booking holds do not cause a false positive');
const freshHold={...hold,booking_created_at:'2026-11-02T11:55:00-03:00'};
assert.equal(explainAdminDemoSchedule(inputs,{
  ...base,booked:[freshHold],
},nowMs).length,1,'Recently placed unpaid holds are still reserved');

assert.deepEqual(explainAdminDemoSchedule(inputs, {
  configured:false,bufferMinutes:0,weekly:[],timeOff:[],booked:[],
},nowMs),[], 'Instructor without configured weekly hours remains unrestricted');

console.log('PASS: demo meeting conflicts identify per-day weekly hours, blocks, bookings and buffer');
