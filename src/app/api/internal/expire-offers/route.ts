import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { offerWorkerEnv } from '@/lib/offer-worker-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Offline offer expiry runner. Requires an explicit activation cutoff before
 * selecting candidates. Preview remains the default.
 */
export async function POST(request: NextRequest) {
  const disabled = () => NextResponse.json({ error: 'not_enabled' }, { status: 503 });
  const config = offerWorkerEnv();
  if (!config.enabled) return disabled();
  const secret = config.secret;
  const key = config.serviceRoleKey;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || secret.length < 32 || !key || !url) return disabled();

  const supplied = request.headers.get('authorization');
  const expected = `Bearer ${secret}`;
  // Compare a fixed-size digest to avoid variable-time string equality.
  const { createHash, timingSafeEqual } = await import('node:crypto');
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(expected))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const nowMs = Date.now();
  const activationMs = Date.parse(config.activatedAt ?? '');
  if (!Number.isFinite(activationMs) || activationMs > nowMs) {
    return NextResponse.json({ error: 'activation_not_configured' }, { status: 503 });
  }
  const activatedAt = new Date(activationMs).toISOString();
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  // Only candidates with expired offers or expired requests are advanced.
  // A fixed cap limits the impact of a mistakenly enabled worker.
  const now = new Date(nowMs).toISOString();
  // Sort by deadline before applying the cap. Without stable ordering, a
  // repeatedly failing request could starve older pending offers indefinitely.
  // The database RPC still owns concurrency locks and idempotent transitions.
  // Compare the owning request's age, even if an old request got a new offer.
  const { data: expiredOffers, error: offerError } = await db.from('instructor_offers')
    .select('request_id,expires_at,instructor_requests!inner(created_at)')
    .in('status', ['offered', 'suggested'])
    .gte('instructor_requests.created_at', activatedAt)
    .lte('expires_at', now).order('expires_at', { ascending: true }).limit(20);
  if (offerError || !Array.isArray(expiredOffers)) return NextResponse.json({ error: 'offer_query_failed' }, { status: 503 });
  const { data: expiredRequests, error: requestError } = await db.from('instructor_requests')
    .select('id,expires_at').eq('status', 'searching')
    .gte('created_at', activatedAt)
    .lte('expires_at', now).order('expires_at', { ascending: true }).limit(20);
  if (requestError || !Array.isArray(expiredRequests)) return NextResponse.json({ error: 'request_query_failed' }, { status: 503 });
  const candidates = [
    ...expiredOffers.map((offer) => ({ id: offer.request_id, deadline: offer.expires_at })),
    ...expiredRequests.map((entry) => ({ id: entry.id, deadline: entry.expires_at })),
  ].filter((candidate) => typeof candidate.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id));
  candidates.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)) || a.id.localeCompare(b.id));
  const ids = [...new Set(candidates.map((candidate) => candidate.id))].slice(0, 10);

  // Preview is the default even with the worker enabled. Only explicitly
  // configured live mode mutates offers; never enable without a test fixture.
  if (!config.apply) {
    return NextResponse.json({ mode: 'preview', candidates: ids.length });
  }
  let advanced = 0;
  let failures = 0;
  for (const id of ids) {
    const { error } = await db.rpc('advance_instructor_offer', { p_request_id: id });
    if (error) failures += 1;
    else advanced += 1;
  }
  return NextResponse.json({ mode: 'apply', processed: advanced, failures }, { status: failures ? 503 : 200 });
}
