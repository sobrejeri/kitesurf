-- READ ONLY: queue expiry and offline-advancement readiness; no customer identifiers.
-- Execute manually in the VentoKite Supabase SQL editor, never as a scheduler.
SELECT
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed,
  to_regclass('cron.job') IS NOT NULL AS cron_job_available,
  to_regprocedure('public.advance_instructor_offer(uuid)') IS NOT NULL AS advance_rpc_available,
  (SELECT count(*) FROM public.instructor_offers
   WHERE status = 'pending' AND expires_at < now()) AS overdue_pending_offers,
  (SELECT count(*) FROM public.instructor_requests
   WHERE status = 'searching' AND expires_at < now()) AS overdue_searches,
  (SELECT count(*) FROM public.profiles WHERE role = 'instructor') AS instructor_profiles;
