-- #92: an expiry worker error MUST fail the scheduler transaction (never JSON -1 / success).
-- Run only in the disposable PostgreSQL suite. The replacement is rolled back.
begin;
create or replace function public.run_queue_expiry_job(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'VNT_EXPIRY_FAILURE_INJECTED' using errcode = 'P0001';
end $$;

do $$
declare caught boolean := false;
begin
  begin
    perform public.run_expiry_jobs();
  exception when sqlstate 'P0001' then
    caught := true;
    assert sqlerrm = 'VNT_EXPIRY_FAILURE_INJECTED', 'unexpected expiry error';
  end;
  assert caught, 'expiry job swallowed failure: scheduler would report success';
end $$;
rollback;
select 'PASS: expiry scheduler propagates injected SQL failure; fixture restored by rollback' as result;
