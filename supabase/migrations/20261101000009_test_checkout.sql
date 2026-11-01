-- Stage 2: simulated checkout methods and outcomes; NEVER charge real money.
begin;
create table public.test_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  method text not null check(method in ('pix','card')),
  outcome text not null check(outcome in ('approved','pending','declined')),
  created_at timestamptz not null default now()
);
create index test_payment_attempt_idx on public.test_payment_attempts(booking_id,created_at desc);
alter table public.test_payment_attempts enable row level security;
revoke all on public.test_payment_attempts from public,anon,authenticated;
grant select on public.test_payment_attempts to authenticated;
create policy test_payment_owner on public.test_payment_attempts for select to authenticated
using(student_id=auth.uid() or public.is_admin());

create function public.simulate_test_payment(p_booking_id uuid,p_method text,p_outcome text)
returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student']::public.app_role[]); b public.bookings;
begin
  if p_method not in ('pix','card') or p_outcome not in ('approved','pending','declined')
    or p_method is null or p_outcome is null then
    raise exception 'Invalid test payment parameters' using errcode='22023'; end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null or b.student_id<>uid then
    raise exception 'Booking not found' using errcode='P0002'; end if;
  if b.status<>'awaiting_payment' or b.created_at<now()-interval '10 minutes' then
    raise exception 'Payment window expired or booking no longer payable' using errcode='55000'; end if;
  if p_outcome='approved' then
    perform public.confirm_test_payment(p_booking_id);
  end if;
  insert into public.test_payment_attempts(booking_id,student_id,method,outcome)
    values(p_booking_id,uid,p_method,p_outcome);
  perform public.write_audit('booking.payment_simulated','booking',p_booking_id::text,null,
    jsonb_build_object('method',p_method,'outcome',p_outcome),'Simulated payment only');
  return p_outcome;
end $$;
revoke execute on function public.simulate_test_payment(uuid,text,text) from public,anon;
grant execute on function public.simulate_test_payment(uuid,text,text) to authenticated;
commit;
