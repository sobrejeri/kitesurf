-- Test-only bookkeeping. No user-facing write RPC, provider call, booking
-- transition or transfer is introduced by this migration.
begin;

create table public.pagarme_test_attempts (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  booking_id uuid not null references public.bookings(id),
  student_id uuid not null references public.profiles(id),
  method text not null check (method in ('pix', 'credit_card')),
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  environment text not null default 'test' check (environment = 'test'),
  status text not null default 'created' check (status in ('created', 'pending', 'unknown', 'approved', 'declined', 'expired', 'refunded')),
  provider_order_id text unique check (provider_order_id is null or provider_order_id ~ '^or_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('pending', 'approved', 'declined', 'expired', 'refunded') or provider_order_id is not null)
);

-- Unknown outcomes and paid/refunded attempts remain blocked until explicit,
-- reviewed reconciliation; blindly retrying could create a second charge.
create unique index pagarme_test_one_unsettled_per_booking on public.pagarme_test_attempts (booking_id)
  where status in ('created', 'pending', 'unknown', 'approved', 'refunded');
create index pagarme_test_attempt_owner on public.pagarme_test_attempts (student_id, created_at desc);

create function public.pagarme_test_attempt_guard() returns trigger language plpgsql set search_path = '' as $$
declare b public.bookings;
begin
  if tg_op = 'INSERT' then
    select * into b from public.bookings where id = new.booking_id;
    if not found or new.student_id <> b.student_id or new.amount_cents <> b.total_cents
       or new.status <> 'created' or new.provider_order_id is not null then
      raise exception 'Invalid test payment snapshot' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.id, new.request_key, new.booking_id, new.student_id, new.method, new.amount_cents, new.environment, new.created_at)
     is distinct from (old.id, old.request_key, old.booking_id, old.student_id, old.method, old.amount_cents, old.environment, old.created_at)
     or (old.provider_order_id is not null and new.provider_order_id is distinct from old.provider_order_id) then
    raise exception 'Test payment snapshot is immutable' using errcode = '23514';
  end if;
  if new.status <> old.status and not (
    (old.status = 'created' and new.status in ('pending', 'unknown', 'approved', 'declined', 'expired'))
    or (old.status = 'unknown' and new.status in ('pending', 'approved', 'declined', 'expired'))
    or (old.status = 'pending' and new.status in ('unknown', 'approved', 'declined', 'expired'))
    or (old.status = 'approved' and new.status = 'refunded')
  ) then raise exception 'Invalid test payment transition' using errcode = '23514'; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger pagarme_test_attempt_guard before insert or update on public.pagarme_test_attempts
  for each row execute function public.pagarme_test_attempt_guard();

alter table public.pagarme_test_attempts enable row level security;
revoke all on public.pagarme_test_attempts from public, anon, authenticated;
grant select on public.pagarme_test_attempts to authenticated;
create policy pagarme_test_attempt_read on public.pagarme_test_attempts for select to authenticated
  using (student_id = (select auth.uid()) or public.is_admin());
revoke all on function public.pagarme_test_attempt_guard() from public, anon, authenticated;
commit;
