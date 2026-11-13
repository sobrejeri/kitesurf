import assert from 'node:assert/strict';
import { planExpiredQueueBatch } from './queue-batch.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n, created_at, expires_at, status = 'searching') => ({ id: id(n), created_at, expires_at, status });
const now = '2026-11-13T12:00:00Z';
const activatedAt = '2026-11-13T11:00:00Z';
const rows = [
 row(1,'2026-11-12T10:00:00Z','2026-11-13T11:59:00Z'),
 row(2,'2026-11-13T11:01:00Z','2026-11-13T11:55:00Z'),
 row(3,'2026-11-13T11:01:00Z','2026-11-13T12:01:00Z'),
 row(4,'2026-11-13T11:01:00Z','2026-11-13T11:50:00Z','accepted'),
 row(5,'2026-11-13T11:01:00Z','2026-11-13T11:40:00Z'),
 row(6,'2026-11-13T11:01:00Z','2026-11-13T11:58:00Z'),
 row(2,'2026-11-13T11:01:00Z','2026-11-13T11:55:00Z'),
];
assert.deepEqual(planExpiredQueueBatch(rows,{now,activatedAt}),[id(2),id(6)]);
// A malformed ID or impossible timestamps must never enter the worker batch.
const badRows = [
  { ...row(7,'2026-11-13T11:01:00Z','2026-11-13T11:59:00Z'), id: id(7) + '-extra' },
  row(8,'2026-11-13T12:01:00Z','2026-11-13T11:59:00Z'),
  row(9,'2026-11-13T11:59:30Z','2026-11-13T11:59:00Z'),
  row(10,'2026-11-13T11:01:00Z','2026-11-13T11:59:00Z'),
];
assert.deepEqual(planExpiredQueueBatch(badRows,{now,activatedAt}),[id(10)]);
assert.deepEqual(planExpiredQueueBatch(rows,{now,activatedAt,limit:1}),[id(2)]);
assert.deepEqual(planExpiredQueueBatch(rows,{now,activatedAt:'2026-11-13T12:00:00Z'}),[]);
assert.throws(()=>planExpiredQueueBatch(rows,{now,activatedAt,limit:101}),RangeError);
assert.throws(()=>planExpiredQueueBatch(rows,{now,activatedAt:'2026-11-14T00:00:00Z'}),TypeError);
console.log('PASS: offline queue batch planner skips legacy/future/duplicate/stale requests');
