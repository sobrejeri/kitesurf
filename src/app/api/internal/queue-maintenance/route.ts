import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(provided: string | null, expected: string): boolean {
  if (!provided?.startsWith('Bearer ') || expected.length < 32) return false;
  const supplied = createHash('sha256').update(provided.slice(7)).digest();
  const stored = createHash('sha256').update(expected).digest();
  return timingSafeEqual(supplied, stored);
}

/** Disabled until the queue expiry procedure is independently homologated. */
export async function POST(request: NextRequest) {
  // eslint-disable-next-line no-restricted-syntax -- server-only opt-in switch
  if (process.env.QUEUE_WORKER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not enabled' }, { status: 503 });
  }
  // eslint-disable-next-line no-restricted-syntax -- server-only bearer token
  const token = process.env.QUEUE_WORKER_TOKEN ?? '';
  if (!authorized(request.headers.get('authorization'), token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // eslint-disable-next-line no-restricted-syntax -- server-only secret, never browser bundled
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  // Bounded batch: retrying is safe because the RPC locks the request and checks its status.
  const { data: expired, error: expiredError } = await db
    .from('instructor_requests').select('id').eq('status', 'searching')
    .lte('expires_at', now).order('expires_at', { ascending: true }).limit(20);
  if (expiredError || !Array.isArray(expired)) {
    console.error('[queue-maintenance] expired selection failed', expiredError.code);
    return NextResponse.json({ error: 'Queue selection failed' }, { status: 500 });
  }
  // Also retry still-open requests; the RPC returns an active offer unchanged and
  // advances only when no valid offer exists. This is deliberately bounded.
  const { data: active, error: activeError } = await db
    .from('instructor_requests').select('id').eq('status', 'searching')
    .gt('expires_at', now).order('created_at', { ascending: true }).limit(20);
  if (activeError || !Array.isArray(active)) {
    console.error('[queue-maintenance] active selection failed', activeError.code);
    return NextResponse.json({ error: 'Queue selection failed' }, { status: 500 });
  }
  let processed = 0;
  let failed = 0;
  // Defensive deduplication: never advance the same request twice in one batch,
  // even if a stale/inconsistent query response repeats an identifier.
  const seen = new Set<string>();
  for (const request of [...expired, ...active]) {
    if (typeof request.id !== 'string' || request.id.length === 0) {
      failed++;
      console.error('[queue-maintenance] invalid request identifier');
      continue;
    }
    if (seen.has(request.id)) continue;
    seen.add(request.id);
    const { error } = await db.rpc('advance_instructor_offer', { p_request_id: request.id });
    if (error) {
      failed++;
      console.error('[queue-maintenance] advance failed', error.code);
    } else processed++;
  }
  return NextResponse.json({ processed, failed }, { status: failed ? 503 : 200 });
}
