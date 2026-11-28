-- Cancelamento de reserva AGUARDANDO PAGAMENTO (retenção de 10 min): auditoria em todos os caminhos e trava de segurança. Aditiva, sem dinheiro real.
-- Hoje a retenção vencida é cancelada por varreduras sem registro de auditoria (create_booking e a guarda de agenda do aluno fazem UPDATE direto).
--  1) AUDITORIA: toda transição awaiting_payment -> cancelled grava 'booking.hold_cancelled', com o estado dos pagamentos de TESTE no momento
--     (had_pending_payment = havia tentativa em processamento; had_approved_payment = havia aprovada). Idempotente: só dispara na transição (um UPDATE que
--     não muda nada não audita de novo).
--  2) TRAVA: não se cancela uma retenção que tenha pagamento APROVADO (isso não pode acontecer: aprovar confirma na mesma transação); se acontecer, a transação aborta (55000).
--     Pagamento EM PROCESSAMENTO ('pending') NÃO bloqueia o cancelamento (política atual preservada: a janela de 10 min vale) mas fica registrado na auditoria.
-- Nenhum dado existente é alterado. Não aplicar antes da revisão.
begin;
create function public.guard_and_audit_hold_cancellation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pending boolean; v_approved boolean;
begin
  if old.status::text <> 'awaiting_payment' or new.status::text <> 'cancelled' then return new; end if;
  select coalesce(bool_or(a.outcome = 'pending'), false), coalesce(bool_or(a.outcome = 'approved'), false)
    into v_pending, v_approved from public.test_payment_attempts a where a.booking_id = new.id;
  if v_approved then
    raise exception 'Cannot cancel a booking hold that has an approved payment' using errcode = '55000';
  end if;
  perform public.write_audit('booking.hold_cancelled', 'booking', new.id::text,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status, 'had_pending_payment', v_pending, 'had_approved_payment', v_approved,
                       'held_minutes', round(extract(epoch from (now() - old.created_at)) / 60)),
    'Unpaid hold cancelled (expired window or availability change); no money moved');
  return new;
end $$;
revoke all on function public.guard_and_audit_hold_cancellation() from public, anon, authenticated;
drop trigger if exists bookings_hold_cancel_guard_audit on public.bookings;
create trigger bookings_hold_cancel_guard_audit
before update of status on public.bookings
for each row execute function public.guard_and_audit_hold_cancellation();
commit;
