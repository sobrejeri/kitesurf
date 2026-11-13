import assert from 'node:assert/strict';
import { runOfflineQueueBatch } from './queue-offline-executor.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const options = { now: '2026-11-13T12:00:00Z', activatedAt: '2026-11-13T11:00:00Z' };
const rows = [
 { id:id(1), status:'searching', created_at:'2026-11-13T11:05:00Z', expires_at:'2026-11-13T11:59:00Z' },
 { id:id(2), status:'searching', created_at:'2026-11-13T11:05:00Z', expires_at:'2026-11-13T11:58:00Z' },
 { id:id(3), status:'searching', created_at:'2026-11-12T11:05:00Z', expires_at:'2026-11-13T11:59:00Z' },
];
const preview = await runOfflineQueueBatch(rows,options);
assert.deepEqual(preview,{dryRun:true,planned:[id(2),id(1)],advanced:[],skipped:[]});
await assert.rejects(()=>runOfflineQueueBatch(rows,{...options,dryRun:false}),TypeError);
const claimed = new Set();
const claimAndAdvance = async id => {
 if (claimed.has(id)) return false;
 claimed.add(id);
 return true;
};
const first = await runOfflineQueueBatch(rows,{...options,dryRun:false,claimAndAdvance});
assert.deepEqual(first.advanced,[id(2),id(1)]);
const second = await runOfflineQueueBatch(rows,{...options,dryRun:false,claimAndAdvance});
assert.deepEqual(second.advanced,[]);
assert.deepEqual(second.skipped,[id(2),id(1)]);
await assert.rejects(()=>runOfflineQueueBatch(rows,{...options,dryRun:false,claimAndAdvance:async()=>null}),TypeError);
console.log('PASS: queue executor contract dry-run, legacy exclusion and repeat safety');
