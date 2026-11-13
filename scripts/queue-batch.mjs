// Pure eligibility planner for a future service-only offline queue worker.
// It never reads or writes a database. Callers must enforce authorization,
// locking, and recheck eligibility transactionally before advancing an offer.
export function planExpiredQueueBatch(rows, options = {}) {
  const { now, activatedAt, limit = 25, maxAgeMinutes = 15 } = options;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('invalid batch limit');
  if (!Number.isSafeInteger(maxAgeMinutes) || maxAgeMinutes < 1 || maxAgeMinutes > 1440) throw new RangeError('invalid age window');
  const current = Date.parse(now);
  const activation = Date.parse(activatedAt);
  if (!Number.isFinite(current) || !Number.isFinite(activation) || activation > current) throw new TypeError('invalid worker timestamps');
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const seen = new Set();
  const eligible = [];
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.id)) continue;
    if (row.status !== 'searching' || seen.has(row.id)) continue;
    const created = Date.parse(row.created_at);
    const deadline = Date.parse(row.expires_at);
    if (!Number.isFinite(created) || !Number.isFinite(deadline)) continue;
    // Legacy requests must be triaged, never silently reprocessed.
    if (created < activation || deadline > current || deadline < current - maxAgeMinutes * 60000) continue;
    seen.add(row.id);
    eligible.push({ id: row.id, deadline });
  }
  eligible.sort((a, b) => a.deadline - b.deadline || a.id.localeCompare(b.id));
  return eligible.slice(0, limit).map(({ id }) => id);
}
