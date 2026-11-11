-- L0 / #145: savePartnerPayout uses the authenticated user's Supabase client
-- for direct INSERT and UPDATE. Production currently grants only SELECT.
-- Migration 45 must be applied first to enforce partner ownership on INSERT.
-- Never grant DELETE or any privilege to anon; no checkout or payment operation.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'partner_payout_details'
      AND policyname = 'partner_payout_owner_insert'
      AND cmd = 'INSERT'
      AND with_check LIKE '%owner_id%'
      AND with_check NOT LIKE '%p.owner_id = p.id%'
  ) THEN
    RAISE EXCEPTION 'Apply security migration 45 before granting partner payout writes';
  END IF;
END
$migration$;
GRANT INSERT, UPDATE ON TABLE public.partner_payout_details TO authenticated;
-- Existing RLS restricts UPDATE to id=auth.uid(), and INSERT to partner owner.
