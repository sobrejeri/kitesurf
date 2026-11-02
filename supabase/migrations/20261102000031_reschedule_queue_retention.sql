-- Migration 31: 72h notice, 12h peer response + 12h student choice.
-- Does not charge again; previously completed classes are retained.
-- Run after Migration 30; this replaces its 48-hour auto-cancel behavior.
BEGIN;

ALTER TABLE public.meeting_change_requests
  ADD COLUMN kind text NOT NULL DEFAULT 'reschedule'
    CHECK(kind IN ('reschedule','cancel')),
  ADD COLUMN choice_until timestamptz;
ALTER TABLE public.meeting_change_requests
  ALTER COLUMN proposed_starts_at DROP NOT NULL;
ALTER TABLE public.meeting_change_requests
  DROP CONSTRAINT change_schedule_distinct,
  DROP CONSTRAINT meeting_change_requests_status_check;
ALTER TABLE public.meeting_change_requests
  ADD CONSTRAINT change_schedule_distinct CHECK(
    (kind='cancel' AND proposed_starts_at IS NULL)
    OR (kind='reschedule' AND proposed_starts_at>original_starts_at)
  ),
  ADD CONSTRAINT meeting_change_requests_status_check CHECK(
    status IN ('pending','accepted','rejected','expired','action_required',
               'cancelled_by_student','sent_to_queue')
  );
CREATE UNIQUE INDEX IF NOT EXISTS meeting_change_one_action_per_booking
  ON public.meeting_change_requests(booking_id) WHERE status='action_required';

ALTER TABLE public.bookings
  ADD COLUMN reassignment_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.booking_meetings
  ADD COLUMN taught_by_instructor_id uuid REFERENCES public.instructors(id);
UPDATE public.booking_meetings m SET taught_by_instructor_id=b.instructor_id
  FROM public.bookings b
  WHERE m.booking_id=b.id AND m.status IN('done','in_progress')
    AND m.taught_by_instructor_id IS NULL;
CREATE INDEX booking_meetings_taught_by_idx ON public.booking_meetings(taught_by_instructor_id)
 WHERE taught_by_instructor_id IS NOT NULL;

-- Original requests remain accepted and linked to their booking. A new
-- queue attempt reuses the same paid booking rather than creating another.
ALTER TABLE public.instructor_requests
 DROP CONSTRAINT IF EXISTS instructor_requests_booking_id_key;
CREATE UNIQUE INDEX instructor_one_active_reassignment
 ON public.instructor_requests(booking_id)
 WHERE booking_id IS NOT NULL AND status='searching';

-- Internal helper: must only be called after acquiring booking FOR UPDATE.
CREATE FUNCTION public.requeue_confirmed_booking(
 p_booking_id uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 b public.bookings;
 v_meetings jsonb;
 v_hours integer;
 v_old_instructor uuid;
 v_id uuid;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF b.id IS NULL OR b.status<>'confirmed' OR b.reassignment_pending THEN
   RAISE EXCEPTION 'Booking cannot be reassigned now' USING errcode='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM public.booking_meetings
   WHERE booking_id=b.id AND status='in_progress') THEN
   RAISE EXCEPTION 'Finish ongoing lesson before changing instructor'
   USING errcode='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.instructor_requests
   WHERE booking_id=b.id AND status='searching') THEN
   RAISE EXCEPTION 'Instructor search already started' USING errcode='55000'; END IF;
 SELECT jsonb_agg(jsonb_build_object('starts_at',m.starts_at,'hours',m.minutes/60)
   ORDER BY m.position),coalesce(sum(m.minutes/60),0)::integer
 INTO v_meetings,v_hours
 FROM public.booking_meetings m
 WHERE m.booking_id=b.id AND m.status='scheduled';
 IF v_meetings IS NULL OR v_hours<1 THEN
   RAISE EXCEPTION 'No future meetings to reassign' USING errcode='55000';
 END IF;
 v_old_instructor:=b.instructor_id;
 UPDATE public.booking_meetings m
    SET taught_by_instructor_id=coalesce(m.taught_by_instructor_id,v_old_instructor)
 WHERE m.booking_id=b.id AND m.status IN('done','in_progress')
   AND m.taught_by_instructor_id IS NULL;
 UPDATE public.bookings
   SET instructor_id=NULL,reassignment_pending=true
   WHERE id=b.id;
 INSERT INTO public.instructor_requests(
    student_id,beach_id,level,language,meetings,total_hours,
    with_transport,price_version_id,status,booking_id,expires_at
 ) VALUES(
    b.student_id,b.beach_id,b.level,b.language,v_meetings,v_hours,
    b.with_transport,b.price_version_id,'searching',b.id,now()+interval '12 hours'
 ) RETURNING id INTO v_id;
 -- No offer to an instructor who has just withdrawn.
 IF v_old_instructor IS NOT NULL THEN
   INSERT INTO public.instructor_offers(
     request_id,instructor_id,status,expires_at,responded_at
   ) VALUES(v_id,v_old_instructor,'declined',now(),now());
 END IF;
 PERFORM public.advance_instructor_offer(v_id);
 INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
 VALUES(b.student_id,'booking','Procurando novo instrutor',
   'Sua reserva foi mantida. Estamos consultando os próximos profissionais da fila, sem nova cobrança.',
   '/aluno/reserva/'||b.id::text);
 PERFORM public.write_audit('booking.instructor_requeue','booking',b.id::text,
   jsonb_build_object('instructor',v_old_instructor),
   jsonb_build_object('request_id',v_id,'instructor',NULL),p_reason);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.requeue_confirmed_booking(uuid,text)
 FROM PUBLIC,anon,authenticated;

-- New SQL version of acceptance only for offers linked to an existing booking:
-- the legacy function is replaced below by an injected branch.
CREATE OR REPLACE FUNCTION public.accept_instructor_offer(p_offer_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
  req_id uuid; r public.instructor_requests; o public.instructor_offers;
  price public.price_versions; partner public.partners; instructor public.instructors;
  total_lesson integer; total_transport integer; split record; v_booking_id uuid;
  meeting jsonb; position integer:=0;
begin
  select request_id into req_id from public.instructor_offers
    where id=p_offer_id and instructor_id=uid;
  if req_id is null then raise exception 'Offer not found' using errcode='P0002'; end if;
  select * into r from public.instructor_requests where id=req_id for update;
  select * into o from public.instructor_offers where id=p_offer_id for update;
  if r.status<>'searching' or o.status<>'offered' or o.expires_at<=now() or r.expires_at<=now() then
    perform public.advance_instructor_offer(req_id);
    return null;
  end if;
  select * into instructor from public.instructors where id=uid for update;
  if instructor.status<>'approved' or not public.instructor_can_attend(uid,r.meetings)
    or not exists(select 1 from public.instructor_beaches ib
      where ib.instructor_id=uid and ib.beach_id=r.beach_id)
    or r.language<>all(instructor.languages)
    or (r.with_transport and not instructor.has_support_vehicle) then
    update public.instructor_offers set status='declined',responded_at=now() where id=o.id;
    perform public.advance_instructor_offer(req_id);
    return null;
  end if;
  -- A queued replacement inherits the original booking and payment.
  IF r.booking_id IS NOT NULL THEN
    PERFORM 1 FROM public.bookings b
      WHERE b.id=r.booking_id AND b.status='confirmed'
        AND b.reassignment_pending AND b.instructor_id IS NULL
      FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.instructor_offers SET status='expired',responded_at=now()
        WHERE id=o.id;
      UPDATE public.instructor_requests SET status='expired'
        WHERE id=r.id;
      RETURN NULL;
    END IF;
    -- Financial columns and all scheduled/completed meeting records stay intact.
    UPDATE public.bookings SET instructor_id=uid,reassignment_pending=false
      WHERE id=r.booking_id AND status='confirmed' AND instructor_id IS NULL
        AND reassignment_pending;
    UPDATE public.instructor_requests SET status='accepted' WHERE id=r.id;
    UPDATE public.instructor_offers SET status='accepted',responded_at=now()
      WHERE id=o.id;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
      VALUES(r.student_id,'booking','Novo instrutor confirmado',
        'Outro instrutor aceitou sua reserva. As aulas e o valor contratado foram mantidos.',
        '/aluno/reserva/'||r.booking_id::text);
    PERFORM public.write_audit('booking.instructor_reassigned','booking',
      r.booking_id::text,NULL,jsonb_build_object('instructor',uid,'request_id',r.id));
    RETURN r.booking_id;
  END IF;
  select * into price from public.price_versions where id=r.price_version_id;
  if price.id is null then raise exception 'Price version unavailable' using errcode='P0002'; end if;
  if r.partner_code is not null
     and not exists(select 1 from public.bookings already
      where already.student_id=r.student_id and already.status in ('confirmed','completed')) then
    select * into partner from public.partners where code=r.partner_code and status='approved';
  end if;
  total_lesson:=r.total_hours*price.hourly_rate_cents;
  total_transport:=case when r.with_transport then r.total_hours*price.transport_hourly_cents else 0 end;
  select * into split from public.split_total(total_lesson,price.platform_commission_bps,partner.commission_bps);
  insert into public.bookings
    (code,student_id,instructor_id,partner_id,price_version_id,beach_id,level,language,total_hours,
     hourly_rate_cents,with_transport,transport_hourly_cents,transport_cents,total_cents,
     partner_cents,platform_cents,instructor_net_cents,presence_code)
  values('VNT-'||nextval('public.booking_code_seq'),r.student_id,uid,partner.id,price.id,
     r.beach_id,r.level,r.language,r.total_hours,price.hourly_rate_cents,
     r.with_transport,case when r.with_transport then price.transport_hourly_cents else 0 end,
     total_transport,total_lesson+total_transport,split.partner_cents,split.platform_cents,
     split.instructor_net_cents+total_transport,
     lpad(floor(random()*10000)::integer::text,4,'0'))
  returning id into v_booking_id;
  for meeting in select value from jsonb_array_elements(r.meetings)
    order by (value->>'starts_at')::timestamptz loop
    position:=position+1;
    insert into public.booking_meetings(booking_id,position,starts_at,minutes)
      values(v_booking_id,position,(meeting->>'starts_at')::timestamptz,(meeting->>'hours')::integer*60);
  end loop;
  update public.instructor_requests set status='accepted',booking_id=v_booking_id
    where id=r.id;
  update public.instructor_offers set status='accepted',responded_at=now() where id=o.id;
  perform public.write_audit('offer.accepted','instructor_offer',o.id::text,null,
    jsonb_build_object('booking',v_booking_id));
  return v_booking_id;
end $$;

