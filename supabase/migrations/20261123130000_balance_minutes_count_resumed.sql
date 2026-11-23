-- #93 (revisão independente de 23/11: "reconciliar 15/240 do legado com o novo fluxo antes de habilitar a flag").
-- booking_balance_minutes somava só done_minutes dos encontros concluídos. Com a interrupção/retomada (migration 20261121120000) os minutos da PRIMEIRA parte
-- ficam em previous_done_minutes e a retomada grava só a segunda parte em done_minutes: um encontro 110 + 10 aparecia como 10 e o saldo ficava 100 min maior.
-- Esta migration só corrige a fórmula (mesma assinatura, mesmas permissões e mesma autorização da migration 42; CREATE OR REPLACE preserva os GRANTs):
--   concluído:               done_minutes + previous_done_minutes
--   agendado/em andamento:   previous_done_minutes + (restante, se interrompido; senão os minutos do encontro)
-- Reservas sem interrupção têm previous_done_minutes = 0 e remaining_minutes nulo: o resultado delas NÃO muda (VNT-1008 continua 225/240 e saldo 15).
-- DEPENDE da 20261121120000 (colunas novas). Não altera reservas, encontros nem dinheiro.
BEGIN;
CREATE OR REPLACE FUNCTION public.booking_balance_minutes(p_booking_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT GREATEST(0,
    b.total_hours * 60
    - COALESCE((SELECT sum(m.done_minutes + m.previous_done_minutes)::integer
                FROM public.booking_meetings m
                WHERE m.booking_id=b.id AND m.status='done'),0)
    - COALESCE((SELECT sum(m.previous_done_minutes
                            + CASE WHEN m.interruption_state IS NOT NULL AND m.interruption_state <> 'resumed'
                                   THEN coalesce(m.remaining_minutes, m.minutes) ELSE m.minutes END)::integer
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
$function$;
NOTIFY pgrst,'reload schema';
COMMIT;
