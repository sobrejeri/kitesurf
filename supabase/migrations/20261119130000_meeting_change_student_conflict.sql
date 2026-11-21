-- P0 #94/#90: remarcar um encontro para um horario que bate com OUTRO encontro do proprio aluno.
-- Aditiva: substitui request_meeting_change e respond_meeting_change (mesmas assinaturas e grants) acrescentando a checagem.
-- Aplicar DEPOIS de 20261117190000_guard_student_meeting_overlap.sql (PR #298). Nao toca em pagamentos nem precos.
BEGIN;
CREATE OR REPLACE FUNCTION public.request_meeting_change(
  p_meeting_id uuid,p_new_start timestamptz,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student','instructor']::public.app_role[]);
  b public.bookings; m public.booking_meetings; v_responder uuid; v_id uuid;
BEGIN
  SELECT existing.* INTO b FROM public.bookings existing
    JOIN public.booking_meetings bm ON bm.booking_id=existing.id WHERE bm.id=p_meeting_id;
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
     WHERE booking_id=b.id AND (status='pending'
       OR (resolution IS NULL AND choice_expires_at IS NOT NULL
         AND choice_expires_at>now()))) THEN
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
  -- P0 #94/#90: o novo horario nao pode bater com OUTRO encontro do proprio aluno (qualquer reserva). Sem isto o pedido
  -- entrava, o instrutor nao conseguia aprovar (gatilho da #298) e, ao expirar, o aluno perdia o instrutor por um pedido impossivel.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-meetings:' || b.student_id::text, 0));
  IF EXISTS(SELECT 1 FROM public.booking_meetings x JOIN public.bookings xb ON xb.id=x.booking_id
     WHERE xb.student_id=b.student_id AND x.id<>m.id AND x.status::text<>'cancelled'
       AND (xb.status='confirmed' OR (xb.status='awaiting_payment' AND xb.created_at>=now()-interval '10 minutes'))
       AND tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.minutes),'[)')
           && tstzrange(p_new_start,p_new_start+make_interval(mins=>m.minutes),'[)')) THEN
    RAISE EXCEPTION 'Student already has a meeting in this time slot'
      USING errcode='55000', hint='STUDENT_MEETING_CONFLICT'; END IF;
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
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-meetings:' || b.student_id::text, 0));
    IF EXISTS(SELECT 1 FROM public.booking_meetings x JOIN public.bookings xb ON xb.id=x.booking_id
       WHERE xb.student_id=b.student_id AND x.id<>m.id AND x.status::text<>'cancelled'
         AND (xb.status='confirmed' OR (xb.status='awaiting_payment' AND xb.created_at>=now()-interval '10 minutes'))
         AND tstzrange(x.starts_at,x.starts_at+make_interval(mins=>x.minutes),'[)')
             && tstzrange(r.proposed_starts_at,r.proposed_starts_at+make_interval(mins=>m.minutes),'[)')) THEN
      RAISE EXCEPTION 'Proposed time is no longer available' USING errcode='55000'; END IF;
    UPDATE public.booking_meetings SET starts_at=r.proposed_starts_at WHERE id=m.id;
  END IF;
  UPDATE public.meeting_change_requests SET
    status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
    responded_at=now(),
    choice_expires_at=CASE WHEN NOT p_accept
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

NOTIFY pgrst, 'reload schema';
COMMIT;
