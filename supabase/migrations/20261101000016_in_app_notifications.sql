-- Phase 8: first-party in-app alerts. No push or external messaging yet.
begin;
create table public.app_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 category text not null check(category in ('offer','booking','message','incident')),
 title text not null check(length(title) between 1 and 120),
 body text not null default '' check(length(body)<=500),
 href text not null check(length(href) between 1 and 240 and left(href,1)='/'),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index notifications_inbox on public.app_notifications(recipient_id,created_at desc);
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public,anon,authenticated;
grant select on public.app_notifications to authenticated;
create policy notifications_recipient on public.app_notifications
 for select to authenticated using(recipient_id=auth.uid());

create function public.mark_my_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['student','instructor','admin','partner']::public.app_role[]);
begin
  update public.app_notifications set read_at=coalesce(read_at,now())
    where id=p_id and recipient_id=uid;
  if not found then raise exception 'Notification not found' using errcode='P0002'; end if;
end $$;

create function public.notify_offer_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if tg_op='INSERT' then
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(new.instructor_id,'offer','Nova solicitação de aula',
        'Você tem uma proposta para responder em até 2 minutos.','/instrutor/solicitacao');
  elsif new.status='suggested' and old.status is distinct from 'suggested' then
    select student_id into rid from public.instructor_requests where id=new.request_id;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(rid,'offer','Instrutor sugeriu outra data',
        'Analise e aceite ou recuse a nova data proposta.',
        '/aluno/solicitacao/'||new.request_id::text);
  elsif new.status='accepted' and old.status is distinct from 'accepted' then
    select student_id into rid from public.instructor_requests where id=new.request_id;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(rid,'offer','Instrutor aceitou a aula',
        'Sua solicitação foi aceita. Acesse para continuar o pagamento.',
        '/aluno/solicitacao/'||new.request_id::text);
  end if;
  return new;
end $$;
create trigger notify_offer after insert or update of status on public.instructor_offers
 for each row execute function public.notify_offer_transition();

create function public.notify_booking_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings; recipient uuid; uri text;
begin
  select * into b from public.bookings where id=new.booking_id;
  if b.id is null then return new; end if;
  recipient:=case when new.sender_id=b.student_id then b.instructor_id else b.student_id end;
  uri:=case when recipient=b.student_id then '/aluno/atendimento/'||b.id::text
       else '/instrutor/atendimento/'||b.id::text end;
  if recipient is not null then
    insert into public.app_notifications(recipient_id,category,title,body,href)
    values(recipient,'message','Nova mensagem sobre sua aula',
      'Uma nova mensagem chegou na conversa da reserva.',uri);
  end if;
  return new;
end $$;
create trigger notify_message after insert on public.booking_messages
 for each row execute function public.notify_booking_message();

create function public.notify_confirmed_booking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='confirmed' and old.status is distinct from 'confirmed' then
    if new.instructor_id is not null then
      insert into public.app_notifications(recipient_id,category,title,body,href)
        values(new.instructor_id,'booking','Pagamento confirmado',
          'O pagamento foi confirmado. A aula aparece na sua agenda.','/instrutor/agenda');
    end if;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(new.student_id,'booking','Aula confirmada',
        'Confira sua reserva e as próximas instruções.','/aluno/reserva/'||new.id::text);
  end if;
  return new;
end $$;
create trigger notify_booking after update of status on public.bookings
 for each row execute function public.notify_confirmed_booking();

create function public.notify_lesson_incident() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings; recipient uuid;
begin
  select * into b from public.bookings where id=new.booking_id;
  recipient:=case when new.reported_by=b.student_id then b.instructor_id else b.student_id end;
  if recipient is not null then
    insert into public.app_notifications(recipient_id,category,title,body,href)
    values(recipient,'incident','Imprevisto registrado',
      'Foi registrado um relato sobre um dos seus encontros.',
      case when recipient=b.student_id then '/aluno/ocorrencias'
           else '/instrutor/ocorrencias' end);
  end if;
  return new;
end $$;
create trigger notify_incident after insert on public.booking_incidents
 for each row execute function public.notify_lesson_incident();

revoke execute on function public.mark_my_notification_read(uuid) from public,anon;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;
commit;
