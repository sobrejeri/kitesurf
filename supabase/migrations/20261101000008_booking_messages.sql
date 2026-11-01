-- Stage 2: persistent private booking conversation.
begin;
create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check(length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index booking_messages_read_idx on public.booking_messages(booking_id,created_at,id);
alter table public.booking_messages enable row level security;
revoke all on public.booking_messages from public,anon,authenticated;
grant select on public.booking_messages to authenticated;
create policy booking_messages_participants on public.booking_messages for select to authenticated using(
  exists (select 1 from public.bookings b where b.id=booking_id
   and b.status in ('confirmed','completed')
   and (b.student_id=auth.uid() or b.instructor_id=auth.uid()))
);

create function public.send_booking_message(p_booking_id uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=public.require_role(array['student','instructor']::public.app_role[]);
  recipient public.bookings; new_id uuid;
begin
  if p_body is null or length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'Message must be 1 to 2000 characters' using errcode='22023';
  end if;
  select * into recipient from public.bookings where id=p_booking_id;
  if recipient.id is null or recipient.status not in ('confirmed','completed')
     or (recipient.student_id<>uid and recipient.instructor_id is distinct from uid) then
    raise exception 'Conversation unavailable' using errcode='42501';
  end if;
  -- Prevent a single user from flooding the conversation with rapid requests.
  if exists(select 1 from public.booking_messages m where m.booking_id=p_booking_id
    and m.sender_id=uid and m.created_at>now()-interval '2 seconds') then
    raise exception 'Please wait before sending again' using errcode='55000';
  end if;
  insert into public.booking_messages(booking_id,sender_id,body)
    values(p_booking_id,uid,btrim(p_body)) returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.send_booking_message(uuid,text) from public,anon;
grant execute on function public.send_booking_message(uuid,text) to authenticated;
commit;
