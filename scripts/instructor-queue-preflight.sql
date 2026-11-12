-- Read-only preflight for offline instructor queue, KITESURF project only.
-- Never invoke advance_instructor_offer() here: it changes live offers.
SELECT
  to_regprocedure('public.advance_instructor_offer(uuid)') IS NOT NULL AS advance_rpc_available,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed,
  to_regclass('cron.job') IS NOT NULL AS cron_job_table_available;

-- Only aggregate counts; no student, instructor, booking or offer identifiers.
SELECT
  (SELECT count(*) FROM public.instructors WHERE status = 'approved') AS approved_instructors,
  (SELECT count(*) FROM public.instructor_requests WHERE status = 'searching') AS searching_requests,
  (SELECT count(*) FROM public.instructor_requests WHERE status = 'searching' AND expires_at <= now()) AS overdue_searches,
  (SELECT count(*) FROM public.instructor_offers WHERE status = 'pending') AS pending_offers,
  (SELECT count(*) FROM public.instructor_offers WHERE status = 'pending' AND expires_at <= now()) AS overdue_offers,
  (SELECT count(*) FROM public.instructor_offers WHERE status = 'pending' AND expires_at IS NULL) AS pending_offers_without_deadline;

-- An absent pg_cron job table does not prove an external scheduler is absent.
-- Inspect Render scheduled jobs / external triggers separately before enabling anything.
