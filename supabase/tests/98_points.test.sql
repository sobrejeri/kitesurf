-- Meeting points: admin creates, only assigned instructor chooses, student reads.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare b public.bookings; point_id uuid; wrong_id uuid; previous_total integer;
begin
  select * into b from public.bookings where status='confirmed'
    order by created_at desc limit 1;
  assert b.id is not null and b.instructor_id is not null,'test booking is confirmed';
  previous_total:=b.total_cents;

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  point_id:=public.create_meeting_point(b.beach_id,'Entrada da praia',
    'Perto da placa de boas-vindas',-2.806500,-40.421500);
  perform pg_temp.reset();
  assert exists(select 1 from public.meeting_points where id=point_id),'admin created point';

  perform pg_temp.act_as(b.student_id::text);
  begin
    perform public.assign_booking_meeting_point(b.id,point_id);
    raise exception 'student assigned meeting point';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as(b.instructor_id::text);
  perform public.assign_booking_meeting_point(b.id,point_id);
  perform pg_temp.reset();
  assert (select meeting_point_id from public.bookings where id=b.id)=point_id,
    'assigned instructor selected point';
  assert (select total_cents from public.bookings where id=b.id)=previous_total,
    'meeting point never changes booking price';

  perform pg_temp.act_as(b.student_id::text);
  assert (select meeting_point_id from public.bookings where id=b.id)=point_id,
    'student can see assigned point';
  perform pg_temp.reset();
end $$;
