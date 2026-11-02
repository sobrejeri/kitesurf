-- Migration 31: protect the sale on reschedule timeout.
-- 72h notice; only later dates; 12h response + 12h student choice.
-- Never cancel automatically: unused slots go to the instructor queue.
BEGIN;

ALTER TABLE public.meeting_change_requests
  ADD COLUMN choice_expires_at timestamptz,
  ADD COLUMN resolution text CHECK(resolution IN ('cancelled','replacement_requested'));
ALTER TABLE public.meeting_change_requests
  ALTER COLUMN expires_at SET DEFAULT (now()+interval '12 hours');

CREATE TABLE public.booking_reassignments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  previous_instructor uuid REFERENCES public.instructors(id),
  status text NOT NULL DEFAULT 'searching'
    CHECK(status IN ('searching','assigned','unfilled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours')
);
CREATE UNIQUE INDEX booking_reassignments_one_active
 ON public.booking_reassignments(booking_id) WHERE status='searching';
CREATE TABLE public.booking_reassignment_offers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reassignment_id uuid NOT NULL REFERENCES public.booking_reassignments(id),
  instructor_id uuid NOT NULL REFERENCES public.instructors(id),
  status text NOT NULL DEFAULT 'offered'
    CHECK(status IN ('offered','accepted','declined','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(reassignment_id,instructor_id)
);
CREATE UNIQUE INDEX booking_reassignment_one_offer
 ON public.booking_reassignment_offers(reassignment_id) WHERE status='offered';
CREATE INDEX booking_reassignment_offer_inbox
 ON public.booking_reassignment_offers(instructor_id,status,expires_at);

ALTER TABLE public.booking_reassignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_reassignment_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_reassignments,public.booking_reassignment_offers
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_reassignments,public.booking_reassignment_offers TO authenticated;
CREATE POLICY reassignment_booking_parties ON public.booking_reassignments
 FOR SELECT TO authenticated USING(
  public.is_admin() OR EXISTS(
    SELECT 1 FROM public.bookings b WHERE b.id=booking_id AND
    (b.student_id=auth.uid() OR b.instructor_id=auth.uid())
  ) OR EXISTS(
    SELECT 1 FROM public.booking_reassignment_offers o
    WHERE o.reassignment_id=id AND o.instructor_id=auth.uid()
  )
);
CREATE POLICY reassignment_offered_instructor ON public.booking_reassignment_offers
 FOR SELECT TO authenticated USING(instructor_id=auth.uid() OR public.is_admin());

-- Candidate selection is serialized on instructor rows and rechecks calendar,
-- qualifications and existing pending offers. No new payment or booking.
CREATE FUNCTION public.advance_booking_reassignment(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.booking_reassignments; b public.bookings;
  i record; v_id uuid; v_meetings jsonb; v_busy boolean;
BEGIN
  SELECT * INTO r FROM public.booking_reassignments WHERE id=p_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'searching' THEN RETURN NULL; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=r.booking_id;
  IF b.status<>'confirmed' OR b.instructor_id IS NOT NULL
     OR r.expires_at<=now() THEN
    UPDATE public.booking_reassignments SET status='unfilled' WHERE id=r.id;
    IF b.status='confirmed' AND b.instructor_id IS NULL THEN
      INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
        VALUES(b.student_id,'booking','Novo instrutor ainda não encontrado',
          'A equipe vai verificar sua reserva. Nenhum pagamento ou cancelamento foi realizado.',
          '/aluno/reserva/'||b.id::text);
      INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
        SELECT id,'booking','Reserva aguardando instrutor',
          'Uma reserva não encontrou substituto na fila dentro do prazo. Verifique a agenda.',
          '/admin/reservas' FROM public.profiles WHERE role='admin';
    END IF;
    RETURN NULL;
  END IF;
  UPDATE public.booking_reassignment_offers SET status='expired',responded_at=now()
   WHERE reassignment_id=r.id AND status='offered' AND expires_at<=now();
  SELECT id INTO v_id FROM public.booking_reassignment_offers
   WHERE reassignment_id=r.id AND status='offered' AND expires_at>now();
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'starts_at',m.starts_at,'hours',m.minutes/60) ORDER BY m.position),'[]'::jsonb)
    INTO v_meetings FROM public.booking_meetings m WHERE m.booking_id=b.id AND m.status='scheduled';
  IF jsonb_array_length(v_meetings)=0 THEN
    UPDATE public.booking_reassignments SET status='unfilled' WHERE id=r.id;
    RETURN NULL;
  END IF;
  FOR i IN SELECT ins.id FROM public.instructors ins
     WHERE ins.status='approved' AND ins.id IS DISTINCT FROM r.previous_instructor
       AND EXISTS(SELECT 1 FROM public.instructor_beaches ib
         WHERE ib.instructor_id=ins.id AND ib.beach_id=b.beach_id)
       AND b.language=any(ins.languages)
       AND (NOT b.with_transport OR ins.has_support_vehicle)
       AND NOT EXISTS(SELECT 1 FROM public.booking_reassignment_offers old
         WHERE old.reassignment_id=r.id AND old.instructor_id=ins.id)
     ORDER BY ins.queue_position NULLS LAST,ins.id
     FOR UPDATE OF ins SKIP LOCKED
  LOOP
    IF NOT public.instructor_can_attend(i.id,v_meetings) THEN CONTINUE; END IF;
    SELECT EXISTS(
      SELECT 1 FROM public.booking_reassignment_offers o
      JOIN public.booking_reassignments other ON other.id=o.reassignment_id
      JOIN public.bookings ob ON ob.id=other.booking_id
      JOIN public.booking_meetings om ON om.booking_id=ob.id AND om.status='scheduled'
      JOIN public.booking_meetings nm ON nm.booking_id=b.id AND nm.status='scheduled'
      WHERE o.instructor_id=i.id AND o.status='offered' AND o.expires_at>now()
      AND other.status='searching' AND other.id<>r.id
      AND tstzrange(om.starts_at,om.starts_at+make_interval(mins=>om.minutes),'[)')
       && tstzrange(nm.starts_at,nm.starts_at+make_interval(mins=>nm.minutes),'[)')
    ) INTO v_busy;
    IF v_busy THEN CONTINUE; END IF;
    INSERT INTO public.booking_reassignment_offers(reassignment_id,instructor_id,expires_at)
      VALUES(r.id,i.id,least(now()+interval '2 minutes',r.expires_at))
      RETURNING id INTO v_id;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
      VALUES(i.id,'offer','Reserva disponível para assumir',
        'Uma reserva já confirmada precisa de novo instrutor. Confira os horários e responda.',
        '/instrutor/solicitacao');
    RETURN v_id;
  END LOOP;
  -- No matching candidates yet; keep pending for periodic retries/admin attention.
  RETURN NULL;
END $$;

CREATE FUNCTION public.begin_booking_reassignment(p_booking_id uuid,p_reason text,p_prior_notice boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.bookings; r uuid; v_previous uuid;
BEGIN
  -- Internal only; caller-facing RPCs enforce student/instructor participation.
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found' USING errcode='P0002'; END IF;
  PERFORM 1 FROM public.instructors WHERE id=b.instructor_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF b.status<>'confirmed' OR b.instructor_id IS NULL THEN
    RAISE EXCEPTION 'Booking not eligible for reassignment' USING errcode='55000';
  END IF;
  IF EXISTS(SELECT 1 FROM public.booking_meetings
    WHERE booking_id=b.id AND status IN ('done','in_progress')) THEN
    RAISE EXCEPTION 'Partially performed booking needs admin reassignment'
      USING errcode='55000'; END IF;
  IF NOT p_prior_notice THEN
    IF NOT EXISTS(SELECT 1 FROM public.booking_meetings
      WHERE booking_id=b.id AND status='scheduled') OR EXISTS(
      SELECT 1 FROM public.booking_meetings WHERE booking_id=b.id
        AND status='scheduled' AND starts_at<now()+interval '72 hours'
    ) THEN RAISE EXCEPTION 'Reassignment requires 72 hours notice'
      USING errcode='22023'; END IF;
  ELSE
    -- The original 72h notice was met. Waiting 12h + 12h must not
    -- invalidate a previously timely cancellation/replacement request.
    IF NOT EXISTS(
      SELECT 1 FROM public.meeting_change_requests c
      WHERE c.booking_id=b.id AND c.requester_id=b.student_id
        AND c.status IN ('expired','rejected') AND c.resolution IS NULL
        AND c.requested_at<=c.original_starts_at-interval '72 hours'
    ) THEN RAISE EXCEPTION 'Valid advance notice not found'
      USING errcode='42501'; END IF;
    IF EXISTS(SELECT 1 FROM public.booking_meetings WHERE booking_id=b.id
      AND status='scheduled' AND starts_at<=now()) THEN
      RAISE EXCEPTION 'Meeting has already started' USING errcode='55000'; END IF;
  END IF;
  v_previous:=b.instructor_id;
  -- An existing change request must not open a second decision after release.
  UPDATE public.meeting_change_requests SET
    status=CASE WHEN status='pending' THEN 'rejected' ELSE status END,
    resolution='replacement_requested',
    choice_expires_at=NULL,
    responded_at=coalesce(responded_at,now())
    WHERE booking_id=b.id AND (status='pending' OR choice_expires_at IS NOT NULL)
      AND resolution IS NULL;
  UPDATE public.bookings SET instructor_id=NULL WHERE id=b.id;
  INSERT INTO public.booking_reassignments(booking_id,previous_instructor)
    VALUES(b.id,v_previous) RETURNING id INTO r;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
   VALUES(b.student_id,'booking','Buscando outro instrutor',
     'Sua reserva continua confirmada. Estamos oferecendo todos os encontros a novos instrutores.',
     '/aluno/reserva/'||b.id::text);
  PERFORM public.write_audit('booking.reassignment_started','booking',b.id::text,
    jsonb_build_object('instructor',v_previous),
    jsonb_build_object('instructor',NULL,'request_id',r),left(p_reason,500));
  PERFORM public.advance_booking_reassignment(r);
  RETURN r;
END $$;

CREATE FUNCTION public.release_my_booking(p_booking_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['instructor']::public.app_role[]);
  b public.bookings; r uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id;
  IF b.id IS NULL OR b.instructor_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'Booking not assigned to you' USING errcode='42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Cancellation reason must have 8 to 500 characters'
      USING errcode='22023'; END IF;
  r:=public.begin_booking_reassignment(p_booking_id,trim(p_reason));
  RETURN r;
END $$;

CREATE FUNCTION public.respond_booking_reassignment(
 p_offer_id uuid,p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['instructor']::public.app_role[]);
  o public.booking_reassignment_offers; r public.booking_reassignments;
  b public.bookings; v_meetings jsonb;
BEGIN
  SELECT * INTO o FROM public.booking_reassignment_offers
   WHERE id=p_offer_id AND instructor_id=uid;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Offer not found' USING errcode='42501'; END IF;
  SELECT * INTO r FROM public.booking_reassignments WHERE id=o.reassignment_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id=r.booking_id FOR UPDATE;
  SELECT * INTO o FROM public.booking_reassignment_offers WHERE id=p_offer_id FOR UPDATE;
  IF o.status<>'offered' OR o.expires_at<=now() OR r.status<>'searching'
    OR b.status<>'confirmed' OR b.instructor_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reassignment offer expired' USING errcode='55000'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Choose response' USING errcode='22023'; END IF;
  IF NOT p_accept THEN
    UPDATE public.booking_reassignment_offers SET status='declined',responded_at=now()
      WHERE id=o.id;
    PERFORM public.advance_booking_reassignment(r.id);
    RETURN;
  END IF;
  PERFORM 1 FROM public.instructors WHERE id=uid AND status='approved' FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',m.starts_at,'hours',m.minutes/60)
     ORDER BY m.position),'[]'::jsonb)
    INTO v_meetings FROM public.booking_meetings m WHERE m.booking_id=b.id AND m.status='scheduled';
  IF NOT EXISTS(SELECT 1 FROM public.instructors i WHERE i.id=uid AND i.status='approved'
    AND b.language=any(i.languages) AND (NOT b.with_transport OR i.has_support_vehicle))
    OR NOT EXISTS(SELECT 1 FROM public.instructor_beaches
      WHERE instructor_id=uid AND beach_id=b.beach_id)
    OR NOT public.instructor_can_attend(uid,v_meetings) THEN
    UPDATE public.booking_reassignment_offers SET status='declined',responded_at=now() WHERE id=o.id;
    PERFORM public.advance_booking_reassignment(r.id);
    RETURN;
  END IF;
  UPDATE public.bookings SET instructor_id=uid WHERE id=b.id;
  UPDATE public.booking_reassignments SET status='assigned' WHERE id=r.id;
  UPDATE public.booking_reassignment_offers SET status='accepted',responded_at=now()
    WHERE id=o.id;
  UPDATE public.instructors SET queue_position=nextval('public.instructor_queue_seq')
    WHERE id=uid;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
  VALUES(b.student_id,'booking','Novo instrutor confirmado',
    'Um novo instrutor assumiu sua reserva; a data e o valor não mudaram.',
    '/aluno/reserva/'||b.id::text),
    (uid,'booking','Você assumiu uma reserva',
    'Confira a agenda e os encontros desta reserva.','/instrutor/agenda');
  PERFORM public.write_audit('booking.reassigned','booking',b.id::text,
    jsonb_build_object('old_instructor',r.previous_instructor),
    jsonb_build_object('new_instructor',uid),NULL);
END $$;

-- Override Migration 30: response is 12 hours, and nonresponse never cancels.
CREATE OR REPLACE FUNCTION public.request_meeting_change(
  p_meeting_id uuid,p_new_start timestamptz,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student','instructor']::public.app_role[]);
  b public.bookings; m public.booking_meetings; v_responder uuid; v_id uuid;
BEGIN
  SELECT b.* INTO b FROM public.bookings b
    JOIN public.booking_meetings bm ON bm.booking_id=b.id WHERE bm.id=p_meeting_id;
  IF b.id IS NULL OR b.status<>'confirmed' OR b.instructor_id IS NULL
    OR uid NOT IN (b.student_id,b.instructor_id) THEN
    RAISE EXCEPTION 'Booking not owned by this participant' USING errcode='42501'; END IF;
  PERFORM 1 FROM public.instructors WHERE id=b.instructor_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id=b.id FOR UPDATE;
  SELECT * INTO m FROM public.booking_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF m.booking_id<>b.id OR m.status<>'scheduled' OR b.status<>'confirmed'
    OR b.instructor_id IS NULL THEN
    RAISE EXCEPTION 'Meeting no longer eligible for change' USING errcode='55000'; END IF;
  IF m.starts_at<now()+interval '72 hours' THEN
    RAISE EXCEPTION 'Meeting change must be requested 72 hours before'
      USING errcode='22023'; END IF;
  IF p_new_start IS NULL OR p_new_start<=m.starts_at
    OR p_new_start>now()+interval '90 days' THEN
    RAISE EXCEPTION 'New date must be after original meeting'
      USING errcode='22023'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Change reason must have 8 to 500 characters'
      USING errcode='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.meeting_change_requests
     WHERE booking_id=b.id AND status='pending') THEN
    RAISE EXCEPTION 'Another change request is waiting for approval'
      USING errcode='55000'; END IF;
  IF EXISTS(SELECT 1 FROM public.booking_meetings other
    WHERE other.booking_id=b.id AND other.id<>m.id AND
     ((other.position<m.position AND other.starts_at
       +make_interval(mins=>other.minutes)>p_new_start) OR
      (other.position>m.position AND other.starts_at
       <p_new_start+make_interval(mins=>m.minutes)))) THEN
    RAISE EXCEPTION 'New meeting time changes booking order'
      USING errcode='55000'; END IF;
  IF NOT public.can_move_meeting(b.instructor_id,m.id,p_new_start,m.minutes) THEN
    RAISE EXCEPTION 'Instructor unavailable for proposed meeting' USING errcode='55000'; END IF;
  v_responder:=CASE WHEN uid=b.student_id THEN b.instructor_id ELSE b.student_id END;
  INSERT INTO public.meeting_change_requests(
    booking_id,meeting_id,requester_id,responder_id,
    original_starts_at,proposed_starts_at,reason,expires_at
  ) VALUES(b.id,m.id,uid,v_responder,m.starts_at,p_new_start,trim(p_reason),
    now()+interval '12 hours') RETURNING id INTO v_id;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
   VALUES(v_responder,'booking','Nova solicitação de alteração',
     'Responda em até 12 horas. Uma alteração só ocorre com sua confirmação.',
     CASE WHEN v_responder=b.student_id THEN '/aluno/reserva/'||b.id::text
       ELSE '/instrutor/aula?aba=proximas&aula='||m.id::text END);
  PERFORM public.write_audit('meeting.change_requested','booking_meeting',m.id::text,
    jsonb_build_object('starts_at',m.starts_at),
    jsonb_build_object('proposed_at',p_new_start,'deadline',now()+interval '12 hours'),trim(p_reason));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.respond_meeting_change(
 p_request_id uuid,p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student','instructor']::public.app_role[]);
  r public.meeting_change_requests; b public.bookings; m public.booking_meetings;
BEGIN
  SELECT * INTO r FROM public.meeting_change_requests WHERE id=p_request_id;
  IF r.id IS NULL OR r.responder_id<>uid THEN
    RAISE EXCEPTION 'Change request not assigned to you' USING errcode='42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=r.booking_id;
  PERFORM 1 FROM public.instructors WHERE id=b.instructor_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id=r.booking_id FOR UPDATE;
  SELECT * INTO r FROM public.meeting_change_requests WHERE id=p_request_id FOR UPDATE;
  SELECT * INTO m FROM public.booking_meetings WHERE id=r.meeting_id FOR UPDATE;
  IF r.status<>'pending' OR now()>=r.expires_at OR b.status<>'confirmed'
    OR m.status<>'scheduled' OR m.starts_at<>r.original_starts_at THEN
    RAISE EXCEPTION 'Change request is no longer valid' USING errcode='55000'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Choose a response' USING errcode='22023'; END IF;
  IF p_accept THEN
    IF r.proposed_starts_at<=m.starts_at OR
      NOT public.can_move_meeting(b.instructor_id,m.id,r.proposed_starts_at,m.minutes)
      OR EXISTS(SELECT 1 FROM public.booking_meetings other
        WHERE other.booking_id=b.id AND other.id<>m.id AND
          ((other.position<m.position AND other.starts_at
           +make_interval(mins=>other.minutes)>r.proposed_starts_at) OR
           (other.position>m.position AND other.starts_at<
            r.proposed_starts_at+make_interval(mins=>m.minutes)))) THEN
       RAISE EXCEPTION 'Proposed time is no longer available' USING errcode='55000'; END IF;
    UPDATE public.booking_meetings SET starts_at=r.proposed_starts_at WHERE id=m.id;
  END IF;
  UPDATE public.meeting_change_requests SET
    status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
    responded_at=now(),
    choice_expires_at=CASE WHEN NOT p_accept AND r.requester_id=b.student_id
      THEN now()+interval '12 hours' ELSE NULL END
    WHERE id=r.id;
  INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
   VALUES(r.requester_id,'booking',
     CASE WHEN p_accept THEN 'Reagendamento aprovado' ELSE 'Reagendamento recusado' END,
     CASE WHEN p_accept THEN 'A nova data foi confirmada para o seu encontro.'
       WHEN r.requester_id=b.student_id THEN
         'Você tem 12 horas para cancelar ou pedir outro instrutor. Sem escolha, a plataforma buscará um substituto.'
       ELSE 'A data original permanece. Você pode manter a aula ou liberar a reserva para a fila.' END,
     CASE WHEN r.requester_id=b.student_id THEN '/aluno/reserva/'||b.id::text
       ELSE '/instrutor/aula?aba=proximas&aula='||m.id::text END);
  PERFORM public.write_audit('meeting.change_responded','booking_meeting',m.id::text,
    jsonb_build_object('from',m.starts_at),
    jsonb_build_object('accepted',p_accept,'proposed',r.proposed_starts_at),NULL);
END $$;

CREATE FUNCTION public.resolve_student_change(p_request_id uuid,p_choice text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student']::public.app_role[]);
  r public.meeting_change_requests; b public.bookings;
BEGIN
  SELECT * INTO r FROM public.meeting_change_requests WHERE id=p_request_id;
  IF r.id IS NULL OR r.requester_id<>uid THEN
    RAISE EXCEPTION 'Choice not available' USING errcode='42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=r.booking_id;
  PERFORM 1 FROM public.instructors WHERE id=b.instructor_id FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id=r.booking_id FOR UPDATE;
  SELECT * INTO r FROM public.meeting_change_requests WHERE id=p_request_id FOR UPDATE;
  IF r.status NOT IN ('expired','rejected') OR r.choice_expires_at IS NULL
    OR r.choice_expires_at<=now() OR r.resolution IS NOT NULL OR b.status<>'confirmed'
    OR p_choice NOT IN ('cancel','replace') THEN
    RAISE EXCEPTION 'Student choice deadline ended' USING errcode='55000'; END IF;
  IF p_choice='cancel' THEN
    IF EXISTS(SELECT 1 FROM public.booking_meetings
      WHERE booking_id=b.id AND status IN ('done','in_progress')) THEN
      RAISE EXCEPTION 'Partially performed booking needs admin cancellation'
        USING errcode='55000'; END IF;
    UPDATE public.booking_meetings SET status='cancelled'
      WHERE booking_id=b.id AND status='scheduled';
    UPDATE public.bookings SET status='cancelled',cancelled_at=now() WHERE id=b.id;
    UPDATE public.meeting_change_requests SET resolution='cancelled' WHERE id=r.id;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
      VALUES(b.instructor_id,'booking','Aluno cancelou a reserva',
        'Cancelamento solicitado pelo aluno após rejeição ou falta de resposta.',
        '/instrutor/agenda');
    PERFORM public.write_audit('booking.student_cancelled','booking',b.id::text,
      jsonb_build_object('status','confirmed'),jsonb_build_object('status','cancelled'),
      'Revisar pagamento e possível reembolso; nenhum estorno foi emitido.');
  ELSE
    PERFORM public.begin_booking_reassignment(b.id,'Solicitação de novo instrutor pelo aluno.',true);
    UPDATE public.meeting_change_requests SET resolution='replacement_requested' WHERE id=r.id;
  END IF;
END $$;

-- Called by the existing job; never auto-cancel on missed reschedule reply.
CREATE OR REPLACE FUNCTION public.expire_meeting_change_requests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.meeting_change_requests; b public.bookings;
 v_processed integer:=0; v_request record;
BEGIN
  FOR r IN SELECT * FROM public.meeting_change_requests
    WHERE status='pending' AND expires_at<=now()
    ORDER BY expires_at FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO b FROM public.bookings WHERE id=r.booking_id;
    UPDATE public.meeting_change_requests SET status='expired',responded_at=now(),
       choice_expires_at=CASE WHEN requester_id=b.student_id
           THEN now()+interval '12 hours' ELSE NULL END
      WHERE id=r.id;
    INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
      VALUES(r.requester_id,'booking','Prazo de resposta encerrado',
       CASE WHEN r.requester_id=b.student_id THEN
         'Escolha em até 12 horas: cancelar ou buscar novo instrutor. Sem escolha, iniciaremos a busca.'
       ELSE 'O aluno não respondeu. Você pode manter o horário original ou liberar a aula para a fila.' END,
       CASE WHEN r.requester_id=b.student_id THEN '/aluno/reserva/'||b.id::text
         ELSE '/instrutor/aula?aba=proximas&aula='||r.meeting_id::text END);
    v_processed:=v_processed+1;
  END LOOP;
  -- After the student's optional choice window, default to preserving the sale.
  FOR r IN SELECT * FROM public.meeting_change_requests
    WHERE status IN ('expired','rejected') AND resolution IS NULL
      AND choice_expires_at IS NOT NULL AND choice_expires_at<=now()
    ORDER BY choice_expires_at FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO b FROM public.bookings WHERE id=r.booking_id;
    IF b.status='confirmed' AND b.instructor_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM public.booking_meetings
        WHERE booking_id=b.id AND status IN ('done','in_progress'))
      AND NOT EXISTS(SELECT 1 FROM public.booking_meetings
        WHERE booking_id=b.id AND status='scheduled'
          AND starts_at<=now()) THEN
      PERFORM public.begin_booking_reassignment(b.id,'Sem escolha do aluno: buscar substituto.',true);
      UPDATE public.meeting_change_requests SET resolution='replacement_requested' WHERE id=r.id;
    ELSE
      -- Preserve booking and flag for admin review when unsafe to transfer.
      UPDATE public.meeting_change_requests SET choice_expires_at=NULL WHERE id=r.id;
      INSERT INTO public.app_notifications(recipient_id,category,title,body,href)
       SELECT id,'booking','Reagendamento requer análise','A reserva precisa de revisão manual; não foi cancelada.',
         '/admin/reservas' FROM public.profiles WHERE role='admin';
    END IF;
    v_processed:=v_processed+1;
  END LOOP;
  FOR v_request IN SELECT id FROM public.booking_reassignments WHERE status='searching'
    ORDER BY created_at LIMIT 100
  LOOP
    PERFORM public.advance_booking_reassignment(v_request.id);
  END LOOP;
  RETURN v_processed;
END $$;

REVOKE EXECUTE ON FUNCTION public.advance_booking_reassignment(uuid),
  public.begin_booking_reassignment(uuid,text,boolean),
  public.release_my_booking(uuid,text),
  public.respond_booking_reassignment(uuid,boolean),
  public.resolve_student_change(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_my_booking(uuid,text),
 public.respond_booking_reassignment(uuid,boolean),
 public.resolve_student_change(uuid,text) TO authenticated;

-- Private offer data, visible only to the instructor who received an active offer.
CREATE FUNCTION public.my_booking_reassignment_offers()
RETURNS TABLE(
  offer_id uuid, booking_code text, expires_at timestamptz,
  beach_name text, lesson_level public.lesson_level,
  lesson_language text, total_hours smallint, with_transport boolean,
  meetings jsonb, instructor_net_cents integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $offers_function$
 SELECT o.id,b.code,o.expires_at,be.name,b.level,b.language,b.total_hours,
   b.with_transport,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('starts_at',m.starts_at,
      'hours',m.minutes/60) ORDER BY m.position),'[]'::jsonb)
    FROM public.booking_meetings m WHERE m.booking_id=b.id AND m.status='scheduled'),
   b.instructor_net_cents
 FROM public.booking_reassignment_offers o
 JOIN public.booking_reassignments r ON r.id=o.reassignment_id
 JOIN public.bookings b ON b.id=r.booking_id
 JOIN public.beaches be ON be.id=b.beach_id
 WHERE o.instructor_id=auth.uid() AND o.status='offered'
   AND o.expires_at>now() AND r.status='searching' AND b.status='confirmed'
   AND b.instructor_id IS NULL;
$offers_function$;
REVOKE EXECUTE ON FUNCTION public.my_booking_reassignment_offers()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_booking_reassignment_offers() TO authenticated;

-- Job name preserved from Migration 30; no duplicate cron jobs. If pg_cron
-- unavailable, execute the explicit setup SQL after enabling the extension.
DO $$
BEGIN
 IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
   PERFORM cron.schedule('vento-meeting-change-expiry','*/1 * * * *',
     'SELECT public.expire_meeting_change_requests()');
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;