-- Endurecimento de respond_balance_meeting (achado P3 da revisão QA de 10/11; ver #92/#94). Não altera permissões nem fluxo válido:
--  1) o respondente precisa ser o instrutor ATUAL da reserva (antes só se conferia o instrutor gravado no pedido);
--  2) saldo NULL é tratado como 0 (antes `minutos > NULL` passava em silêncio).
-- CREATE OR REPLACE mantém os GRANTs (só `authenticated` executa; anon/PUBLIC não). Migration nova; nada editado.
BEGIN;
CREATE OR REPLACE FUNCTION public.respond_balance_meeting(
  p_request_id uuid, p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  r public.balance_meeting_requests;
  b public.bookings;
  v_balance integer;
  v_position smallint;
  v_meeting_id uuid;
BEGIN
  SELECT * INTO r FROM public.balance_meeting_requests WHERE id = p_request_id;
  IF r.id IS NULL OR r.instructor_id <> v_uid THEN
    RAISE EXCEPTION 'Make-up request not found for this instructor' USING errcode = '42501';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = r.booking_id FOR UPDATE;
  SELECT * INTO r FROM public.balance_meeting_requests WHERE id = p_request_id FOR UPDATE;
  -- Endurecimento (QA 10/11, P3): quem responde precisa ser o instrutor ATUAL da reserva, não só o do pedido.
  -- Se a reserva trocou de instrutor, o pedido antigo não pode mais ser aceito por quem saiu.
  IF b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Make-up request not found for this instructor' USING errcode = '42501';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Make-up request already decided' USING errcode = '55000';
  END IF;
  IF now() >= r.expires_at THEN
    RAISE EXCEPTION 'Make-up request response deadline expired' USING errcode = '55000';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Booking is no longer confirmed' USING errcode = '55000';
  END IF;
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Choose accept or reject' USING errcode = '22023';
  END IF;

  IF p_accept THEN
    v_balance := COALESCE(public.booking_balance_minutes(b.id), 0);
    IF r.minutes > v_balance THEN
      RAISE EXCEPTION 'The remaining balance changed; ask the student to send a new request'
        USING errcode = '55000';
    END IF;
    IF r.proposed_starts_at < now() + interval '24 hours'
      OR public.student_has_meeting_overlap(r.student_id, r.proposed_starts_at, r.minutes)
      OR NOT public.can_move_meeting(b.instructor_id, gen_random_uuid(), r.proposed_starts_at, r.minutes)
    THEN
      RAISE EXCEPTION 'The proposed time is no longer available' USING errcode = '55000';
    END IF;

    SELECT COALESCE(max(position), 0) + 1 INTO v_position
      FROM public.booking_meetings WHERE booking_id = b.id;
    INSERT INTO public.booking_meetings(booking_id, position, starts_at, minutes, status)
    VALUES (b.id, v_position, r.proposed_starts_at, r.minutes, 'scheduled')
    RETURNING id INTO v_meeting_id;
  END IF;

  UPDATE public.balance_meeting_requests
    SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
        responded_at = now(),
        created_meeting_id = v_meeting_id
    WHERE id = r.id;

  INSERT INTO public.app_notifications(recipient_id, category, title, body, href)
  VALUES (r.student_id, 'booking',
    CASE WHEN p_accept THEN 'Aula de reposição confirmada' ELSE 'Aula de reposição recusada' END,
    CASE WHEN p_accept THEN 'O instrutor confirmou a nova aula para usar seu saldo de horas. Nenhuma cobrança foi feita.'
      ELSE 'O instrutor recusou a data proposta. Seu saldo de horas continua disponível para reagendar.' END,
    '/aluno/reserva/' || b.id::text);

  PERFORM public.write_audit('booking.balance_responded', 'booking', b.id::text,
    jsonb_build_object('request_id', r.id, 'minutes', r.minutes),
    jsonb_build_object('accepted', p_accept, 'meeting_id', v_meeting_id));
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
