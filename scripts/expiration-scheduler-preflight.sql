-- VentoKite: preflight READ-ONLY before enabling expiry automation.
-- Run against the KITESURF Supabase project only (qadkqjfmmnxvovyyhqxw).
-- Do not schedule or invoke expiry RPCs until the impact is reviewed.
-- This script exposes only aggregate counts and metadata, never customer records.
-- Safe when pg_cron is absent (does not reference cron.job directly).

SELECT
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed,
  to_regclass('cron.job') IS NOT NULL AS cron_job_table_available,
  to_regprocedure('public.expire_meeting_change_requests()') IS NOT NULL
    AS meeting_expiration_rpc_available,
  to_regprocedure('public.expire_balance_meeting_requests()') IS NOT NULL
    AS balance_expiration_rpc_available;

SELECT
  'meeting_change_requests' AS request_type,
  count(*) FILTER (WHERE status = 'pending') AS pending_requests,
  count(*) FILTER (WHERE status = 'pending' AND expires_at < now()) AS overdue_pending_requests,
  count(*) FILTER (WHERE status = 'pending' AND expires_at IS NULL) AS pending_without_deadline
FROM public.meeting_change_requests
UNION ALL
SELECT
  'balance_meeting_requests',
  count(*) FILTER (WHERE status = 'pending'),
  count(*) FILTER (WHERE status = 'pending' AND expires_at < now()),
  count(*) FILTER (WHERE status = 'pending' AND expires_at IS NULL)
FROM public.balance_meeting_requests;

-- If pg_cron is installed, inspect its jobs separately before enabling anything:
-- SELECT jobname, schedule, active, command FROM cron.job
-- WHERE jobname LIKE 'vento-%';
-- Never execute the commented query on an installation without cron.job.
-- IMPORTANT: the first scheduled run may mutate existing overdue requests.
