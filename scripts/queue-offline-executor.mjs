import { planExpiredQueueBatch } from './queue-batch.mjs';

// Explicitly opt-in orchestration contract. The supplied claimAndAdvance must
// acquire a DB row lock and revalidate status, expiry, ownership and instructor
// availability within ONE transaction before making any changes.
// This module has no credentials, scheduler, or database side effects.
export async function runOfflineQueueBatch(rows, options = {}) {
  const { claimAndAdvance, dryRun = true, ...plannerOptions } = options;
  const ids = planExpiredQueueBatch(rows, plannerOptions);
  if (dryRun) return { dryRun: true, planned: ids, advanced: [], skipped: [] };
  if (typeof claimAndAdvance !== 'function') {
    throw new TypeError('transactional claimAndAdvance callback required');
  }
  const advanced = [];
  const skipped = [];
  for (const id of ids) {
    // A callback must return true ONLY when a single atomic transaction
    // actually advanced this request. False means stale/already claimed.
    const changed = await claimAndAdvance(id);
    if (changed === true) advanced.push(id);
    else if (changed === false) skipped.push(id);
    else throw new TypeError('claimAndAdvance must return a boolean');
  }
  return { dryRun: false, planned: ids, advanced, skipped };
}
