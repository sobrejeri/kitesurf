# Lesson RPC hardening — compatibility inventory (Block 1)

Status: **review only; NOT safe to deploy**. The isolated SQL suite passed on GitHub Actions run #2154, but it tests grant boundaries, not the full authenticated lesson lifecycle after deployment.

## Confirmed legacy call sites

- `supabase/tests/10_rules.test.sql`: directly calls `public.start_meeting` for assigned/unassigned instructor and incorrect PIN tests; directly calls `public.record_meeting` for excessive minutes and successful 90-minute completion.
- `supabase/tests/99zzzzzzzzzz_booking_balance_reuse.test.sql`: `pg_temp.short_booking` and the make-up completion path call `public.record_meeting` after `public.start_ordered_meeting`.
- `supabase/tests/91_lesson_rpc_gates.test.sql`: deliberately revokes helper privileges in a transaction and rolls back so later legacy regression suites continue to run.

These test dependencies are **not proof** that production frontend clients are migrated. GitHub code search returned no results for the function-name searches, so a full branch checkout and repository-wide search is required before changing production grants.

## Required before promoting review SQL to migration

1. Inventory `supabase.rpc` calls across frontend, server, Edge Functions, and historical client versions; migrate every direct helper call to the validated wrappers.
2. Update legacy SQL tests to invoke `start_ordered_meeting` and `record_meeting_with_skills` where appropriate, preserving negative authorization, PIN, ordering, minutes, progress and balance assertions.
3. Run **positive** assigned-instructor start and completion tests as `authenticated` with the helper grants revoked; the current gate test only proves wrapper privileges and `SECURITY DEFINER` metadata.
4. Test future start window (product policy: up to 24h before) against actual SQL wrapper implementation, not just the client-side date gate.
5. Reconcile migration ordering and existing production schema; produce a numbered forward migration and an explicit rollback script.
6. Validate staging end-to-end and obtain a passing CI run before deploying to production.

## CI evidence

- Run #2149 failed because the review patch persisted grant changes into later balance tests.
- Run #2152 passed after wrapping grant changes in a transaction and rolling back.
- Run #2154 passed with additional assertions confirming that the original helper privileges were restored after the review test.

Do not enable checkout or apply the proposed grant patch directly to production as part of this review.
