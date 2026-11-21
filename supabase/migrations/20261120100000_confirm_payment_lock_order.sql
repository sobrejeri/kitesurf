-- P2-1 da revisão independente da PR #300: deadlock entre PAGAR uma reserva e CRIAR outra com o mesmo instrutor (mesmo aluno, duas abas).
--
-- Antes: confirm_test_payment travava o PERFIL do aluno (FOR UPDATE) e só no fim atualizava a linha do INSTRUTOR (fila). Já create_booking
-- e accept_instructor_offer travam o INSTRUTOR primeiro e tomam KEY SHARE no PERFIL ao inserir a reserva. Espera circular; o Postgres aborta
-- um dos lados com 40P01 (sem corrupção, mas o aluno vê falha genérica).
--
-- Agora: a confirmação segue a ordem canônica do restante do fluxo: INSTRUTOR -> PERFIL -> RESERVA (o advisory do aluno continua sempre
-- o último). Com o instrutor travado primeiro, a criação concorrente (skip locked) pula esse instrutor e responde "sem instrutor
-- disponível" em vez de esperar, e nenhum ciclo é possível. O resto do corpo é idêntico ao de 20261101000010.
-- Só afeta o pagamento SIMULADO do ambiente de teste (nenhum dinheiro real). Não toca em dados, preços ou valores.
begin;
create or replace function public.confirm_test_payment(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['student']::public.app_role[]);
  b public.bookings;
  v_instructor uuid;
begin
  -- 1) INSTRUTOR primeiro (lido sem travar a reserva, só para saber qual linha travar).
  select instructor_id into v_instructor from public.bookings where id = p_booking_id and student_id = uid;
  if v_instructor is not null then
    perform 1 from public.instructors where id = v_instructor for update;
  end if;
  -- 2) PERFIL: serializa as tentativas de pagamento do cliente (evita dupla comissão de afiliado com reservas pendentes em paralelo).
  perform 1 from public.profiles where id = uid for update;
  -- 3) RESERVA.
  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null or b.student_id <> uid then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if b.instructor_id is distinct from v_instructor then
    -- a reserva trocou de instrutor entre a leitura e o lock (reatribuição): tentar de novo, sem inverter a ordem dos locks
    raise exception 'Booking changed, try again' using errcode = '40001';
  end if;
  if b.status <> 'awaiting_payment' then
    raise exception 'Booking is not awaiting payment' using errcode = '55000';
  end if;

  if b.created_at < now()-interval '10 minutes' then
    raise exception 'Payment window expired' using errcode='55000';
  end if;
  if b.partner_cents > 0 and exists (
    select 1 from public.bookings paid
    where paid.student_id=uid and paid.id<>b.id
      and paid.status in ('confirmed','completed')
  ) then
    raise exception 'First paid booking already exists; please request a new booking without affiliate commission'
      using errcode='55000';
  end if;
  update public.bookings set status = 'confirmed', confirmed_at = now() where id = b.id;
  -- The instructor's turn is used: back to the end of the queue.
  update public.instructors set queue_position = nextval('public.instructor_queue_seq')
  where id = b.instructor_id;

  perform public.write_audit('booking.payment_confirmed_test', 'booking', b.id::text,
    jsonb_build_object('status', b.status), jsonb_build_object('status', 'confirmed'),
    'Test payment — no money moved');
end;
$$;
notify pgrst, 'reload schema';
commit;
