-- #93/#103: regra de início do encontro = até 24 horas antes do horário agendado (decisão do responsável, 19/11/2026).
-- Antes: liberava pelo dia do calendário em Fortaleza. Agora: libera quando faltam 24h ou menos (e também depois do horário, para início tardio).
-- 24h é um intervalo absoluto (instante), portanto independe do fuso; o horário agendado continua sendo exibido em America/Fortaleza.
-- Só start_ordered_meeting muda (mesma assinatura, mesmas permissões, mesmo bloqueio de ordem). Não edita migration aplicada.
BEGIN;
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
  SELECT * INTO v_meeting
    FROM public.booking_meetings WHERE id=p_meeting_id FOR UPDATE;
  SELECT * INTO v_booking
    FROM public.bookings WHERE id=v_meeting.booking_id FOR UPDATE;
  IF v_meeting.id IS NULL OR v_booking.instructor_id IS DISTINCT FROM v_instructor THEN
    RAISE EXCEPTION 'Meeting not found' USING errcode='P0002';
  END IF;
  IF v_meeting.status <> 'scheduled' OR v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Meeting cannot be started' USING errcode='55000';
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
NOTIFY pgrst, 'reload schema';
COMMIT;
