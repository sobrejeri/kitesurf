-- Admin-only nonfinancial test lesson.
-- Test entries are explicit and must be excluded from all finance and payouts.
-- They are retained for audit and can be cancelled by an admin.
begin;

alter table public.bookings
  add column is_test boolean not null default false;

create index bookings_test_flag_idx on public.bookings(is_test,created_at desc)
  where is_test;

create function public.create_admin_test_lesson(
  p_instructor_id uuid,
  p_student_id uuid,
  p_beach_id uuid,
  p_starts_at timestamptz,
  p_hours integer
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=public.require_role(array['admin']::public.app_role[]);
  v_ins public.instructors;
  v_price public.price_versions:=public.current_price_version();
  v_split record;
  v_id uuid;
  v_code text;
  v_meetings jsonb;
  v_lesson_cents integer;
begin
  if p_instructor_id is null or p_student_id is null
    or p_instructor_id=p_student_id
    or not exists(select 1 from public.profiles p
      where p.id=p_student_id and p.role='student')
    or not exists(select 1 from public.beaches b
      where b.id=p_beach_id and b.active)
    or p_hours is null or p_hours not between 1 and 8
    or p_starts_at is null or p_starts_at < now()+interval '1 hour'
    or p_starts_at > now()+interval '60 days'
  then
    raise exception 'Invalid test lesson parameters' using errcode='22023';
  end if;

  -- Lock the instructor so competing bookings do not choose the same slot.
  select * into v_ins from public.instructors where id=p_instructor_id for update;
  if v_ins.id is null then
    raise exception 'Instructor not found' using errcode='P0002';
  end if;
  if v_price.id is null then
    raise exception 'A published price is needed to create the financial snapshot'
      using errcode='P0002';
  end if;

  v_meetings:=jsonb_build_array(
    jsonb_build_object('starts_at',p_starts_at,'hours',p_hours)
  );
  if not public.instructor_can_attend(v_ins.id,v_meetings) then
    raise exception 'Instructor has a class or block at the selected time'
      using errcode='55000';
  end if;

  v_lesson_cents:=p_hours * v_price.hourly_rate_cents;
  select * into v_split
    from public.split_total(v_lesson_cents,v_price.platform_commission_bps,0);

  v_code:='VNT-TEST-'||nextval('public.booking_code_seq');
  insert into public.bookings(
    code,student_id,instructor_id,price_version_id,beach_id,level,language,
    total_hours,hourly_rate_cents,with_transport,transport_hourly_cents,
    transport_cents,total_cents,partner_cents,platform_cents,
    instructor_net_cents,presence_code,status,confirmed_at,is_test
  ) values(
    v_code,p_student_id,p_instructor_id,v_price.id,p_beach_id,'first_time',
    coalesce(nullif(v_ins.languages[1],''),'Português'),p_hours,
    v_price.hourly_rate_cents,false,0,0,v_lesson_cents,
    0,v_split.platform_cents,v_split.instructor_net_cents,
    lpad(floor(random()*10000)::integer::text,4,'0'),
    'confirmed',now(),true
  ) returning id into v_id;

  insert into public.booking_meetings(
    booking_id,position,starts_at,minutes
  ) values(v_id,1,p_starts_at,p_hours*60);

  perform public.write_audit(
    'booking.test_created','booking',v_id::text,null,
    jsonb_build_object(
      'code',v_code,'instructor',p_instructor_id,
      'student',p_student_id,'starts_at',p_starts_at,'hours',p_hours
    ),'Aula de teste criada pelo administrador — sem pagamento ou repasse'
  );

  insert into public.app_notifications(recipient_id,category,title,body,href)
    values(
      p_instructor_id,'booking','Aula de teste agendada',
      'Verifique a aula demonstrativa em Meu dia e Agenda. Não há pagamento.',
      '/instrutor/hoje'
    );
  return v_id;
end $$;

create function public.cancel_admin_test_lesson(p_booking_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['admin']::public.app_role[]);
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings
    where id=p_booking_id for update;

  if v_booking.id is null or not v_booking.is_test then
    raise exception 'Test lesson not found' using errcode='P0002';
  end if;
  if v_booking.status='cancelled' then
    return;
  end if;
  if exists(select 1 from public.booking_meetings m
    where m.booking_id=v_booking.id
      and m.status in ('in_progress','done')) then
    raise exception 'A started test must be completed before cleanup'
      using errcode='55000';
  end if;

  update public.booking_meetings set status='cancelled'
    where booking_id=v_booking.id and status='scheduled';

  update public.bookings
    set status='cancelled',cancelled_at=now()
    where id=v_booking.id;

  perform public.write_audit(
    'booking.test_cancelled','booking',v_booking.id::text,
    jsonb_build_object('status',v_booking.status),
    jsonb_build_object('status','cancelled'),
    'Teste encerrado pelo administrador'
  );
end $$;

-- Harden against a test booking being mistaken for a real paid booking.
create function public.reject_test_payment() returns trigger
language plpgsql as $$
begin
  if old.is_test and new.is_test
    and old.status is distinct from new.status
    and new.status='awaiting_payment' then
      raise exception 'Test booking cannot become payable' using errcode='42501';
  end if;
  return new;
end $$;
create trigger bookings_test_no_payment
  before update on public.bookings
  for each row execute function public.reject_test_payment();

revoke execute on function public.create_admin_test_lesson(uuid,uuid,uuid,timestamptz,integer)
  from public,anon,authenticated;
revoke execute on function public.cancel_admin_test_lesson(uuid)
  from public,anon,authenticated;
grant execute on function public.create_admin_test_lesson(uuid,uuid,uuid,timestamptz,integer)
  to authenticated;
grant execute on function public.cancel_admin_test_lesson(uuid)
  to authenticated;

commit;
