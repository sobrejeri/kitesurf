-- ROLLBACK da migration 20261121120000_meeting_interruption_resume.sql (PR #323, #93) E da 20261123130000_balance_minutes_count_resumed.sql (que depende dela). GERADO por scripts/test-backup-rollback.sh a partir do estado
-- anterior; o teste prova que este arquivo devolve o banco ao fingerprint de antes (colunas, restrições, funções, ACLs, gatilhos, RLS, dados).
-- USE SÓ COM BACKUP VERIFICADO E EM JANELA CONTROLADA. Rode com `psql -1 -f` (uma transação). NÃO está no caminho de migrations.
-- RECUSA se houver encontro interrompido: apagar as colunas perderia o motivo, os minutos e o estado da continuidade (exporte antes).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_meetings WHERE interruption_count > 0 OR interruption_state IS NOT NULL OR previous_done_minutes > 0) THEN
    RAISE EXCEPTION 'Rollback refused: interrupted meetings exist (data would be lost). Complete or export them first.';
  END IF;
END $$;
-- 1) primeiro a função que lê as colunas novas volta ao corpo anterior (20261123130000 -> migration 42); só depois as colunas podem sair.
CREATE OR REPLACE FUNCTION public.booking_balance_minutes(p_booking_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT GREATEST(0,
    b.total_hours * 60
    - COALESCE((SELECT sum(m.done_minutes)::integer
                FROM public.booking_meetings m
                WHERE m.booking_id=b.id AND m.status='done'),0)
    - COALESCE((SELECT sum(m.minutes)::integer
                FROM public.booking_meetings m
                WHERE m.booking_id=b.id
                  AND m.status IN ('scheduled','in_progress')),0)
  )
  FROM public.bookings b
  WHERE b.id=p_booking_id
    AND (
      b.student_id=auth.uid()
      OR b.instructor_id=auth.uid()
      OR public.is_admin()
    );
$function$
;
DROP TRIGGER IF EXISTS guard_interrupted_meeting_completion ON public.booking_meetings;
DROP FUNCTION IF EXISTS public.guard_interrupted_meeting_completion();
DROP FUNCTION IF EXISTS public.interrupt_meeting(uuid, text, integer, integer, integer[], integer[]);
DROP FUNCTION IF EXISTS public.schedule_meeting_resume(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.complete_meeting_with_skills(uuid, integer, integer[], integer[]);
DROP FUNCTION IF EXISTS public.save_meeting_steps(uuid, integer[], integer[]);
DROP FUNCTION IF EXISTS public.assert_valid_meeting_steps(integer, integer[], integer[]);
ALTER TABLE public.booking_meetings DROP CONSTRAINT IF EXISTS booking_meetings_interruption_consistent;
ALTER TABLE public.booking_meetings
  DROP COLUMN IF EXISTS planned_minutes, DROP COLUMN IF EXISTS previous_done_minutes, DROP COLUMN IF EXISTS interruption_state,
  DROP COLUMN IF EXISTS interruption_reason, DROP COLUMN IF EXISTS interrupted_at, DROP COLUMN IF EXISTS remaining_minutes,
  DROP COLUMN IF EXISTS interruption_count, DROP COLUMN IF EXISTS resume_scheduled_at;
-- Corpos anteriores das duas funções que a migration substituiu (ACLs não mudam com CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.start_ordered_meeting(p_meeting_id uuid, p_presence_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.start_meeting(p_meeting_id uuid, p_presence_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
begin
  select * into m from public.booking_meetings where id = p_meeting_id for update;
  select * into b from public.bookings where id = m.booking_id;
  -- Assigned instructor only. An admin does not start lessons on anyone's behalf.
  if m.id is null or b.instructor_id is distinct from uid then
    raise exception 'Meeting not found' using errcode = 'P0002';
  end if;
  if b.status <> 'confirmed' or m.status <> 'scheduled' then
    raise exception 'Meeting cannot be started' using errcode = '55000';
  end if;
  if p_presence_code is distinct from b.presence_code then
    raise exception 'Presence code does not match' using errcode = '22023';
  end if;
  update public.booking_meetings set status = 'in_progress', started_at = now() where id = m.id;
end;
$function$
;
NOTIFY pgrst, 'reload schema';
