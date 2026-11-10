-- Standalone read-only authorization regression for booking_balance_minutes.
-- Runs in disposable CI Postgres; changes no booking/meeting/payment rows.
\set ON_ERROR_STOP on
BEGIN READ ONLY;

SELECT id AS booking_id,student_id,instructor_id
FROM public.bookings
WHERE student_id='00000000-0000-0000-0000-0000000000b1'::uuid
  AND instructor_id IS NOT NULL
ORDER BY created_at,id LIMIT 1 \gset

SELECT CASE WHEN :'instructor_id'::uuid='00000000-0000-0000-0000-0000000000a1'::uuid
  THEN '00000000-0000-0000-0000-0000000000a2'::uuid
  ELSE '00000000-0000-0000-0000-0000000000a1'::uuid
 END AS other_instructor \gset

SELECT set_config('test.balance_booking',:'booking_id',false);
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon','public.booking_balance_minutes(uuid)','EXECUTE'),
    'Anonymous users must not execute balance RPC';
  ASSERT has_function_privilege('authenticated','public.booking_balance_minutes(uuid)','EXECUTE'),
    'Authorized authenticated users need balance RPC';
END $$;

SELECT set_config('request.jwt.claim.sub',:'student_id',false);
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT public.booking_balance_minutes(current_setting('test.balance_booking')::uuid) IS NOT NULL,
    'Booking student must be able to read their minutes';
  ASSERT public.booking_balance_minutes('00000000-0000-0000-0000-000000000099') IS NULL,
    'Missing booking must not have a balance';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'instructor_id',false);
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT public.booking_balance_minutes(current_setting('test.balance_booking')::uuid) IS NOT NULL,
    'Current assigned instructor should see booking balance';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT public.booking_balance_minutes(current_setting('test.balance_booking')::uuid) IS NOT NULL,
    'Admin should see booking balance';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.bookings
    WHERE id=current_setting('test.balance_booking')::uuid)=0,
    'Partner must not see booking table row';
  ASSERT public.booking_balance_minutes(current_setting('test.balance_booking')::uuid) IS NULL,
    'Partner must not see private booking minutes via SECURITY DEFINER RPC';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT public.booking_balance_minutes(current_setting('test.balance_booking')::uuid) IS NULL,
    'Unrelated student must not see private minutes';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',:'other_instructor',false);
SET ROLE authenticated;
DO $$
BEGIN
  ASSERT public.booking_balance_minutes(current_setting('test.balance_booking')::uuid) IS NULL,
    'Instructor not assigned to booking must not see private minutes';
END $$;
RESET ROLE;

SELECT 'PASS: balance minutes visible only to authorized student, instructor and Admin' AS result;
ROLLBACK;
