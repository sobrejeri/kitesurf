-- READ ONLY. Save this one JSON result before/after DDL and after the vehicle
-- metadata test. Compare payloads exactly in a window without unrelated writes.
-- Returns counts/hashes, never source rows, identities, prices or credentials.
-- The new metadata and its new audit records are intentionally outside this
-- legacy snapshot; inspect their counts separately in postflight.
BEGIN READ ONLY;
WITH snapshots AS (
  SELECT 'instructors' AS relation_name,count(*) AS row_count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS fingerprint FROM public.instructors t
  UNION ALL SELECT 'price_versions',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.price_versions t
  UNION ALL SELECT 'bookings',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.bookings t
  UNION ALL SELECT 'booking_meetings',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.booking_meetings t
  UNION ALL SELECT 'instructor_requests',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.instructor_requests t
  UNION ALL SELECT 'instructor_offers',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.instructor_offers t
  UNION ALL SELECT 'instructor_schedule_settings',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.instructor_schedule_settings t
  UNION ALL SELECT 'instructor_weekly_hours',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.instructor_weekly_hours t
  UNION ALL SELECT 'instructor_time_off',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.instructor_time_off t
  UNION ALL SELECT 'instructor_beaches',count(*),md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) FROM public.instructor_beaches t
)
SELECT jsonb_build_object(
  'tables',(SELECT jsonb_object_agg(relation_name,jsonb_build_object('rows',row_count,'hash',fingerprint)) FROM snapshots),
  'existing_public_functions',(SELECT md5(coalesce(jsonb_agg(jsonb_build_object(
      'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
      'owner',r.rolname,'acl',coalesce(p.proacl::text,'')) ORDER BY p.oid::regprocedure::text)::text,'[]'))
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')
      AND p.proname<>'save_my_support_vehicle')) AS legacy_snapshot;
COMMIT;
