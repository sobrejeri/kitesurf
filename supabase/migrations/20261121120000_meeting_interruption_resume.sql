-- #93 Etapa 1/4 (Fase A, ADITIVA): interrupção excepcional por aula e retomada agendada pelo instrutor.
-- Decisão de produto (21/11/2026, docs/FLUXO_INTERRUPCAO_AULA_93.md): a unidade é a aula/encontro; aula concluída normalmente,
-- ainda que com menos minutos que o previsto, NÃO gera saldo. Só o instrutor atribuído registra interrupção (motivo + tempo restante)
-- e agenda a continuidade do MESMO encontro (sem nova linha, sem cobrança). O aluno é avisado e vai ao chat da reserva.
--
-- Esta migration NÃO altera funções legadas de registro (record_meeting, record_meeting_with_skills) nem as de saldo
-- (request/respond_balance_meeting, close_booking_balance): reservas e telas atuais seguem iguais até a Fase B.
-- Mudam apenas start_ordered_meeting e start_meeting, que passam a recusar um encontro interrompido ainda sem continuidade agendada.
-- Nenhuma linha existente é alterada: as colunas novas entram com valores neutros (interruption_count = 0).
--
-- Modelo (estado explícito no encontro original):
--   status 'scheduled' + interruption_state 'awaiting_resume'  -> interrompido, aguardando o instrutor agendar a continuidade
--   status 'scheduled' + interruption_state 'resume_scheduled' -> continuidade agendada (starts_at/minutes = nova data/restante)
--   status 'in_progress'                                        -> continuidade iniciada (start_ordered_meeting, com PIN)
--   status 'done'      + interruption_state 'resumed'           -> concluída; minutos totais = previous_done_minutes + done_minutes
-- Usar 'scheduled' (e não um valor novo do enum) mantém a reserva 'confirmed' e o encontro "ativo" para todo código legado.
BEGIN;

ALTER TABLE public.booking_meetings
  ADD COLUMN IF NOT EXISTS planned_minutes smallint CHECK (planned_minutes IS NULL OR planned_minutes BETWEEN 1 AND 480),
  ADD COLUMN IF NOT EXISTS previous_done_minutes smallint NOT NULL DEFAULT 0 CHECK (previous_done_minutes >= 0),
  ADD COLUMN IF NOT EXISTS interruption_state text CHECK (interruption_state IN ('awaiting_resume', 'resume_scheduled', 'resumed')),
  ADD COLUMN IF NOT EXISTS interruption_reason text CHECK (interruption_reason IS NULL OR char_length(interruption_reason) BETWEEN 8 AND 500),
  ADD COLUMN IF NOT EXISTS interrupted_at timestamptz,
  ADD COLUMN IF NOT EXISTS remaining_minutes smallint CHECK (remaining_minutes IS NULL OR remaining_minutes BETWEEN 1 AND 480),
  ADD COLUMN IF NOT EXISTS interruption_count smallint NOT NULL DEFAULT 0 CHECK (interruption_count >= 0),
  ADD COLUMN IF NOT EXISTS resume_scheduled_at timestamptz;

ALTER TABLE public.booking_meetings
  ADD CONSTRAINT booking_meetings_interruption_consistent CHECK (
    (interruption_state IS NULL AND interruption_count = 0 AND previous_done_minutes = 0)
    OR (interruption_state IS NOT NULL AND interruption_count > 0
        AND interruption_reason IS NOT NULL AND remaining_minutes IS NOT NULL AND planned_minutes IS NOT NULL
        AND previous_done_minutes + remaining_minutes <= planned_minutes)
  );

-- ---------------------------------------------------------------------------
-- Internos (fechados à API): validação e gravação monotônica das habilidades.
-- A chave (meeting_id, step_number) já impede duplicar; "mastered" sobe de "practiced", nunca desce.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.assert_valid_meeting_steps(p_done integer, p_practiced integer[], p_mastered integer[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_steps integer[];
BEGIN
  IF p_practiced IS NULL OR p_mastered IS NULL THEN
    RAISE EXCEPTION 'Skill lists are required' USING errcode = '22023';
  END IF;
  v_steps := p_practiced || p_mastered;
  IF EXISTS (SELECT 1 FROM unnest(v_steps) AS x WHERE x IS NULL OR x NOT BETWEEN 1 AND 6)
     OR cardinality(v_steps) <> (SELECT count(DISTINCT x) FROM unnest(v_steps) AS x)
     OR (p_done = 0 AND cardinality(v_steps) > 0)
     OR (p_done > 0 AND cardinality(v_steps) = 0)
  THEN
    RAISE EXCEPTION 'Select valid kite skills for the minutes taught' USING errcode = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_valid_meeting_steps(integer, integer[], integer[]) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_meeting_steps(p_meeting uuid, p_practiced integer[], p_mastered integer[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.meeting_skill_progress(meeting_id, step_number, result)
  SELECT p_meeting, x::smallint, r FROM (
    SELECT unnest(p_practiced) AS x, 'practiced'::text AS r
    UNION ALL SELECT unnest(p_mastered), 'mastered'::text) s
  ON CONFLICT (meeting_id, step_number) DO UPDATE
    SET result = 'mastered', recorded_at = now()
    WHERE EXCLUDED.result = 'mastered' AND public.meeting_skill_progress.result <> 'mastered';
$$;
REVOKE ALL ON FUNCTION public.save_meeting_steps(uuid, integer[], integer[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Interromper (instrutor atribuído, encontro em andamento).
--    Chamada repetida é RECUSADA sem efeito (o encontro já não está em andamento): nada duplica.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.interrupt_meeting(
  p_meeting_id uuid, p_reason text, p_done_minutes integer, p_remaining_minutes integer,
  p_practiced_steps integer[] DEFAULT '{}', p_mastered_steps integer[] DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_planned integer;
  v_prev integer;
BEGIN
  -- Dono primeiro, sem travar nada: quem não é o instrutor da reserva recebe o mesmo erro de "não existe".
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id;
  SELECT * INTO b FROM public.bookings WHERE id = m.booking_id;
  IF m.id IS NULL OR b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  -- Ordem canônica de locks (instrutor -> reserva -> encontro), igual às demais funções de agenda.
  PERFORM 1 FROM public.instructors WHERE id = v_uid FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id = b.id FOR UPDATE;
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  IF m.status <> 'in_progress' OR b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a meeting in progress can be interrupted' USING errcode = '55000';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Interruption reason must have 8 to 500 characters' USING errcode = '22023';
  END IF;
  IF p_done_minutes IS NULL OR p_done_minutes < 0 OR p_done_minutes > m.minutes THEN
    RAISE EXCEPTION 'Done minutes must be between 0 and %', m.minutes USING errcode = '22023';
  END IF;
  PERFORM public.assert_valid_meeting_steps(p_done_minutes, p_practiced_steps, p_mastered_steps);

  v_planned := coalesce(m.planned_minutes, m.minutes);
  v_prev := m.previous_done_minutes + p_done_minutes;
  -- Restante: pelo menos 1 e o que ainda cabe na aula prevista (previsto - já ministrado).
  IF p_remaining_minutes IS NULL OR p_remaining_minutes < 1 OR p_remaining_minutes > v_planned - v_prev THEN
    RAISE EXCEPTION 'Remaining minutes must be between 1 and % (planned % minus % already taught); otherwise complete the meeting normally',
      greatest(v_planned - v_prev, 0), v_planned, v_prev USING errcode = '22023';
  END IF;

  PERFORM public.save_meeting_steps(m.id, p_practiced_steps, p_mastered_steps);
  UPDATE public.booking_meetings SET
    status = 'scheduled', started_at = NULL, done_minutes = 0,
    planned_minutes = v_planned, previous_done_minutes = v_prev, remaining_minutes = p_remaining_minutes,
    interruption_state = 'awaiting_resume', interruption_reason = v_reason, interrupted_at = now(),
    interruption_count = interruption_count + 1, resume_scheduled_at = NULL
  WHERE id = m.id;

  INSERT INTO public.app_notifications(recipient_id, category, title, body, href)
  VALUES (b.student_id, 'booking', 'Aula interrompida',
    'Aula interrompida. Entre em contato com seu instrutor pelo chat para combinar a continuidade.',
    '/aluno/atendimento/' || b.id::text);
  PERFORM public.write_audit('meeting.interrupted', 'booking_meeting', m.id::text,
    jsonb_build_object('status', m.status, 'minutes', m.minutes, 'previous_done_minutes', m.previous_done_minutes),
    jsonb_build_object('done_minutes_this_segment', p_done_minutes, 'previous_done_minutes', v_prev,
      'remaining_minutes', p_remaining_minutes, 'planned_minutes', v_planned, 'practiced', p_practiced_steps, 'mastered', p_mastered_steps),
    v_reason);
END $$;

-- ---------------------------------------------------------------------------
-- 2. Agendar a continuidade do MESMO encontro (só o instrutor atribuído; sem cobrança).
--    Pode reagendar enquanto a continuidade ainda não começou. Confere agenda do instrutor, ordem da reserva e conflito do aluno.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.schedule_meeting_resume(p_meeting_id uuid, p_starts_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
  v_old timestamptz;
BEGIN
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id;
  SELECT * INTO b FROM public.bookings WHERE id = m.booking_id;
  IF m.id IS NULL OR b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  PERFORM 1 FROM public.instructors WHERE id = v_uid FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id = b.id FOR UPDATE;
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  IF b.status <> 'confirmed' OR m.status <> 'scheduled'
     OR m.interruption_state IS NULL OR m.interruption_state NOT IN ('awaiting_resume', 'resume_scheduled') THEN
    RAISE EXCEPTION 'Only an interrupted meeting waiting for continuation can be scheduled' USING errcode = '55000';
  END IF;
  IF p_starts_at IS NULL OR p_starts_at <= now() OR p_starts_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'Continuation must be in the future, within 90 days' USING errcode = '22023';
  END IF;
  -- A ordem da reserva continua valendo: a continuidade vem depois dos encontros anteriores e antes dos seguintes.
  IF EXISTS (SELECT 1 FROM public.booking_meetings o
      WHERE o.booking_id = b.id AND o.id <> m.id AND o.status <> 'cancelled'
        AND ((o.position < m.position AND o.starts_at + make_interval(mins => o.minutes) > p_starts_at)
          OR (o.position > m.position AND o.starts_at < p_starts_at + make_interval(mins => m.remaining_minutes)))) THEN
    RAISE EXCEPTION 'Continuation time changes booking order' USING errcode = '55000';
  END IF;
  IF NOT public.can_move_meeting(v_uid, m.id, p_starts_at, m.remaining_minutes) THEN
    RAISE EXCEPTION 'Instructor unavailable for proposed meeting' USING errcode = '55000';
  END IF;
  -- Aluno: mesmo trava (por aluno) e mesma recusa do gatilho da #298, excluindo o próprio encontro.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-meetings:' || b.student_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.booking_meetings o JOIN public.bookings ob ON ob.id = o.booking_id
      WHERE ob.student_id = b.student_id AND o.id <> m.id AND o.status <> 'cancelled' AND ob.status IN ('confirmed', 'awaiting_payment')
        AND tstzrange(o.starts_at, o.starts_at + make_interval(mins => o.minutes), '[)')
            && tstzrange(p_starts_at, p_starts_at + make_interval(mins => m.remaining_minutes), '[)')) THEN
    RAISE EXCEPTION 'Student already has a meeting in this time slot' USING errcode = '55000';
  END IF;

  v_old := m.starts_at;
  UPDATE public.booking_meetings SET starts_at = p_starts_at, minutes = m.remaining_minutes,
    interruption_state = 'resume_scheduled', resume_scheduled_at = now()
  WHERE id = m.id;

  INSERT INTO public.app_notifications(recipient_id, category, title, body, href)
  VALUES (b.student_id, 'booking', 'Continuidade da aula agendada',
    'O instrutor agendou a continuidade da sua aula. Nenhuma cobrança foi feita.', '/aluno/reserva/' || b.id::text);
  PERFORM public.write_audit('meeting.resume_scheduled', 'booking_meeting', m.id::text,
    jsonb_build_object('starts_at', v_old, 'minutes', m.minutes),
    jsonb_build_object('starts_at', p_starts_at, 'minutes', m.remaining_minutes, 'state', 'resume_scheduled'));
END $$;

-- ---------------------------------------------------------------------------
-- 3. Concluir (normal ou continuidade). Caminho NOVO: não cria saldo por minutos a menos.
--    A reserva só conclui quando nenhum encontro seguir 'scheduled'/'in_progress' (interrompidos pendentes contam como pendentes).
--    Chamada repetida é recusada (o encontro já está 'done'); habilidades não duplicam.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.complete_meeting_with_skills(
  p_meeting_id uuid, p_done_minutes integer, p_practiced_steps integer[], p_mastered_steps integer[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
  v_total integer;
BEGIN
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id;
  SELECT * INTO b FROM public.bookings WHERE id = m.booking_id;
  IF m.id IS NULL OR b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  PERFORM 1 FROM public.instructors WHERE id = v_uid FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id = b.id FOR UPDATE;
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF b.instructor_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  IF m.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Start the meeting with the presence code first' USING errcode = '55000';
  END IF;
  IF p_done_minutes IS NULL OR p_done_minutes < 0 OR p_done_minutes > m.minutes THEN
    RAISE EXCEPTION 'Done minutes must be between 0 and %', m.minutes USING errcode = '22023';
  END IF;
  PERFORM public.assert_valid_meeting_steps(p_done_minutes, p_practiced_steps, p_mastered_steps);

  v_total := m.previous_done_minutes + p_done_minutes;
  PERFORM pg_catalog.set_config('vento.meeting_flow', 'v2', true);   -- autoriza o gatilho de proteção abaixo
  UPDATE public.booking_meetings SET status = 'done', done_minutes = p_done_minutes, recorded_at = now(),
    interruption_state = CASE WHEN interruption_state IS NULL THEN NULL ELSE 'resumed' END
  WHERE id = m.id;
  PERFORM pg_catalog.set_config('vento.meeting_flow', '', true);     -- autorização vale só para este UPDATE
  PERFORM public.save_meeting_steps(m.id, p_practiced_steps, p_mastered_steps);

  IF NOT EXISTS (SELECT 1 FROM public.booking_meetings WHERE booking_id = b.id AND status IN ('scheduled', 'in_progress')) THEN
    UPDATE public.bookings SET status = 'completed' WHERE id = b.id;
  END IF;

  PERFORM public.write_audit('meeting.completed', 'booking_meeting', m.id::text,
    jsonb_build_object('status', m.status, 'interruption_state', m.interruption_state),
    jsonb_build_object('done_minutes_this_segment', p_done_minutes, 'total_done_minutes', v_total,
      'practiced', p_practiced_steps, 'mastered', p_mastered_steps));
END $$;

-- ---------------------------------------------------------------------------
-- 4. Proteção: um encontro que já foi interrompido só vira 'done' pelo caminho novo (que soma os minutos anteriores).
--    Impede que record_meeting/record_meeting_with_skills (legado) conclua uma continuidade e perca os minutos da 1ª parte.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.guard_interrupted_meeting_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF new.status = 'done' AND old.status <> 'done' AND new.interruption_count > 0
     AND pg_catalog.current_setting('vento.meeting_flow', true) IS DISTINCT FROM 'v2' THEN
    RAISE EXCEPTION 'An interrupted meeting must be completed with complete_meeting_with_skills' USING errcode = '55000';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.guard_interrupted_meeting_completion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_interrupted_meeting_completion
BEFORE UPDATE OF status ON public.booking_meetings
FOR EACH ROW EXECUTE FUNCTION public.guard_interrupted_meeting_completion();

-- ---------------------------------------------------------------------------
-- 5. Iniciar: um encontro interrompido SEM continuidade agendada não inicia (precisa agendar antes).
--    start_ordered_meeting = versão da 20261120120000 (janela de 24h) + uma condição. start_meeting = original + a mesma condição.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_ordered_meeting(
  p_meeting_id uuid, p_presence_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $ordered$
DECLARE
  v_instructor uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  v_meeting public.booking_meetings;
  v_booking public.bookings;
BEGIN
  -- Dono primeiro, sem travar; depois a ordem canônica de locks (instrutor -> reserva -> encontro), igual às RPCs de
  -- interrupção/retomada e às de remarcação. (Antes: encontro -> reserva, o que podia formar ciclo com schedule_meeting_resume.)
  SELECT * INTO v_meeting FROM public.booking_meetings WHERE id=p_meeting_id;
  SELECT * INTO v_booking FROM public.bookings WHERE id=v_meeting.booking_id;
  IF v_meeting.id IS NULL OR v_booking.instructor_id IS DISTINCT FROM v_instructor THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode='P0002';
  END IF;
  PERFORM 1 FROM public.instructors WHERE id=v_instructor FOR UPDATE;
  SELECT * INTO v_booking FROM public.bookings WHERE id=v_booking.id FOR UPDATE;
  SELECT * INTO v_meeting FROM public.booking_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF v_booking.instructor_id IS DISTINCT FROM v_instructor THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode='P0002';
  END IF;
  IF v_meeting.status <> 'scheduled' OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Meeting cannot be started' USING errcode='55000';
  END IF;
  IF v_meeting.interruption_state = 'awaiting_resume' THEN
    RAISE EXCEPTION 'Schedule the continuation of the interrupted meeting first' USING errcode='55000';
  END IF;
  IF v_meeting.starts_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'Meeting start window has not opened'
      USING errcode='55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_meetings previous
    WHERE previous.booking_id=v_meeting.booking_id
      AND previous.position<v_meeting.position
      AND previous.status <> 'done'
  ) THEN
    RAISE EXCEPTION 'Finish the previous meeting first'
      USING errcode='55000';
  END IF;
  PERFORM public.start_meeting(p_meeting_id,p_presence_code);
END;
$ordered$;
REVOKE ALL ON FUNCTION public.start_ordered_meeting(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_ordered_meeting(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_meeting(p_meeting_id uuid, p_presence_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
BEGIN
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id;
  SELECT * INTO b FROM public.bookings WHERE id = m.booking_id;
  -- Assigned instructor only. An admin does not start lessons on anyone's behalf.
  IF m.id IS NULL OR b.instructor_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  -- Ordem canônica de locks (instrutor -> reserva -> encontro); as chamadas via start_ordered_meeting já os seguram.
  PERFORM 1 FROM public.instructors WHERE id = uid FOR UPDATE;
  SELECT * INTO b FROM public.bookings WHERE id = b.id FOR UPDATE;
  SELECT * INTO m FROM public.booking_meetings WHERE id = p_meeting_id FOR UPDATE;
  IF b.instructor_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode = 'P0002';
  END IF;
  IF b.status <> 'confirmed' OR m.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Meeting cannot be started' USING errcode = '55000';
  END IF;
  IF m.interruption_state = 'awaiting_resume' THEN
    RAISE EXCEPTION 'Schedule the continuation of the interrupted meeting first' USING errcode = '55000';
  END IF;
  IF p_presence_code IS DISTINCT FROM b.presence_code THEN
    RAISE EXCEPTION 'Presence code does not match' USING errcode = '22023';
  END IF;
  UPDATE public.booking_meetings SET status = 'in_progress', started_at = now() WHERE id = m.id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_meeting(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_meeting(uuid,text) TO authenticated;

-- Grants das funções novas: só instrutor autenticado (o papel é conferido dentro, por require_role).
REVOKE ALL ON FUNCTION public.interrupt_meeting(uuid, text, integer, integer, integer[], integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.interrupt_meeting(uuid, text, integer, integer, integer[], integer[]) TO authenticated;
REVOKE ALL ON FUNCTION public.schedule_meeting_resume(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_meeting_resume(uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_meeting_with_skills(uuid, integer, integer[], integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_meeting_with_skills(uuid, integer, integer[], integer[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
