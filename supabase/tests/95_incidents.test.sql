-- Incident workflow: participant can report, unrelated user cannot, admin reviews.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare bid uuid; mid uuid; incident_id uuid;
begin
  select id into bid from public.bookings where code='VNT-1001';
  select id into mid from public.booking_meetings where booking_id=bid order by position limit 1;
  assert bid is not null and mid is not null, 'fixture has booking and meeting';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.report_lesson_incident(bid,mid,'weather',0,
      'Tentativa de enviar relato sobre outra aula');
    raise exception 'unrelated person reported occurrence';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  incident_id:=public.report_lesson_incident(bid,mid,'weather',0,
    'Vento fraco e condições insuficientes na praia.');
  assert (select status from public.booking_incidents where id=incident_id)='open',
    'student incident saved';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  assert (select count(*) from public.booking_incidents where id=incident_id)=0,
    'unrelated instructor does not see report';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  perform public.review_lesson_incident(incident_id,'reviewing',
    'Aguardando informações para avaliar a situação.');
  perform pg_temp.reset();

  assert (select status from public.booking_incidents where id=incident_id)='reviewing',
    'admin review persisted';
  assert (select count(*) from public.audit_logs where action='incident.reviewed'
    and entity_id=incident_id::text)=1,'review change has immutable audit trail';
end $$;
