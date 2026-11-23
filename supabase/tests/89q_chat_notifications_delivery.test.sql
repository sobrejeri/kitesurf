-- Lote de 10, item 7: os 4 gatilhos notify_* DISPARAM e entregam ao destinatário certo (não basta "enabled"), mesmo com EXECUTE revogado das
-- funções de gatilho (hotfix 20261123114813); mensagens e localização respeitam participante e RLS. Banco descartável; tudo revertido (ROLLBACK).
-- O que NÃO se prova aqui: entrega em canal real (push/Realtime/app autenticado em aparelho). Isso exige sessões e ambiente.
\set ON_ERROR_STOP on
begin;
create function pg_temp.try(q text, who uuid) returns text language plpgsql as $$
declare st text; msg text;
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  execute 'set local role authenticated';
  begin execute q; exception when others then get stacked diagnostics msg = message_text; st := sqlstate; end;
  execute 'reset role';
  return coalesce(st || ':' || msg, 'ok');
end $$;
create function pg_temp.free_slot(p_from int, p_to int) returns timestamptz language sql as $$
  select c.st from (select (date_trunc('day', now() at time zone 'America/Fortaleza') + make_interval(days => d, hours => h)) at time zone 'America/Fortaleza' st
    from generate_series(p_from, p_to) d cross join generate_series(8, 10) h) c
  where c.st > now() + interval '2 hours'
    and public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1', jsonb_build_array(jsonb_build_object('starts_at', c.st, 'hours', 1)))
    and not exists (select 1 from public.booking_meetings m join public.bookings k on k.id = m.booking_id
        where k.student_id = '00000000-0000-0000-0000-0000000000b2' and m.status::text <> 'cancelled' and k.status::text in ('confirmed', 'awaiting_payment')
          and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(c.st - interval '3 hours', c.st + interval '3 hours', '[)'))
  order by c.st limit 1 $$;
-- quantos avisos um usuário recebeu (como superusuário, para não depender da RLS) e quantos ele ENXERGA (como ele, com RLS)
create function pg_temp.got(p_user uuid, p_title text, p_href text) returns int language sql as $$
  select count(*)::int from public.app_notifications where recipient_id = p_user and title = p_title and href = p_href $$;
create function pg_temp.sees(p_user uuid) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true); execute 'set local role authenticated';
  select count(*) into n from public.app_notifications; execute 'reset role'; return n;
end $$;

do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1'; a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  stu constant uuid := '00000000-0000-0000-0000-0000000000b2'; oth constant uuid := '00000000-0000-0000-0000-0000000000b1';
  adm constant uuid := '00000000-0000-0000-0000-00000000000a';
  d1 timestamptz; bk uuid; m1 uuid; r text; loc uuid; msg uuid; n0 int; total0 int; offered uuid;
begin
  -- Reserva (aluno b2 x instrutor a1): o PAGAMENTO confirma e o gatilho avisa os dois.
  d1 := pg_temp.free_slot(3, 80);
  assert d1 is not null, 'FIXTURE: horario livre';
  total0 := pg_temp.got(a2, 'Aula confirmada', '/instrutor/agenda');   -- (como superusuário; outros testes já deixaram avisos de a2: compara-se a variação)
  perform set_config('request.jwt.claim.sub', stu::text, true); execute 'set local role authenticated';
  bk := public.create_booking((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português', jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 1)));
  assert pg_temp.got(stu, 'Aula confirmada', '/aluno/reserva/' || bk) = 0, 'antes de pagar: sem aviso de confirmação';
  perform public.simulate_test_payment(bk, 'pix', 'approved');
  execute 'reset role';
  assert (select instructor_id from public.bookings where id = bk) = a1, 'FIXTURE: instrutor a1';
  select id into m1 from public.booking_meetings where booking_id = bk;
  -- notify_confirmed_booking
  assert pg_temp.got(stu, 'Aula confirmada', '/aluno/reserva/' || bk) = 1, 'aluno recebe exatamente 1 aviso de confirmação';
  assert pg_temp.got(a1, 'Aula confirmada', '/instrutor/agenda') >= 1, 'instrutor é avisado da confirmação (texto da migration 34)';
  assert pg_temp.got(oth, 'Aula confirmada', '/aluno/reserva/' || bk) = 0 and pg_temp.got(a2, 'Aula confirmada', '/instrutor/agenda') = total0, 'terceiros não recebem';

  -- notify_booking_message: o aluno envia LOCALIZAÇÃO (mensagem + coordenadas); só o instrutor é avisado.
  r := pg_temp.try(format('select public.send_chat_location(%L, 91, 0)', bk), stu);       assert r like '22023:%', 'latitude 91 recusada: ' || r;
  r := pg_temp.try(format('select public.send_chat_location(%L, -91, 0)', bk), stu);      assert r like '22023:%', 'latitude -91 recusada: ' || r;
  r := pg_temp.try(format('select public.send_chat_location(%L, 0, 181)', bk), stu);      assert r like '22023:%', 'longitude 181 recusada: ' || r;
  r := pg_temp.try(format('select public.send_chat_location(%L, NULL, 0)', bk), stu);     assert r like '22023:%', 'latitude nula recusada: ' || r;
  r := pg_temp.try(format('select public.send_chat_location(%L, 0, NULL)', bk), stu);     assert r like '22023:%', 'longitude nula recusada: ' || r;
  assert (select count(*) from public.booking_messages where booking_id = bk) = 0 and (select count(*) from public.booking_message_locations where booking_id = bk) = 0, 'recusas não deixam mensagem nem coordenada';
  -- quem NÃO participa não envia nem localização nem texto, e nada é gerado
  foreach r in array array[oth::text, a2::text, adm::text] loop
    assert pg_temp.try(format('select public.send_chat_location(%L, -2.8, -40.5)', bk), r::uuid) like '42501:%', 'não participante não compartilha localização: ' || r;
    assert pg_temp.try(format('select public.send_booking_message(%L, ''oi'')', bk), r::uuid) like '42501:%', 'não participante não envia mensagem: ' || r;
  end loop;
  assert (select count(*) from public.booking_messages where booking_id = bk) = 0, 'recusas não deixam mensagem';
  select count(*) into total0 from public.app_notifications;
  r := pg_temp.try(format('select public.send_chat_location(%L, -2.8, -40.5)', bk), stu);
  assert r = 'ok', 'aluno compartilha localização: ' || r;
  assert (select count(*) from public.booking_messages where booking_id = bk and sender_id = stu) = 1 and (select count(*) from public.booking_message_locations where booking_id = bk) = 1, '1 mensagem e 1 localização';
  assert pg_temp.got(a1, 'Nova mensagem sobre sua aula', '/instrutor/atendimento/' || bk) = 1, 'o instrutor é avisado, com link para a conversa da reserva';
  assert pg_temp.got(stu, 'Nova mensagem sobre sua aula', '/aluno/atendimento/' || bk) = 0, 'quem enviou não recebe aviso da própria mensagem';
  assert (select count(*) from public.app_notifications) = total0 + 1, 'exatamente 1 aviso novo';
  -- RLS da localização: só os dois participantes leem as coordenadas
  foreach r in array array[stu::text, a1::text, oth::text, a2::text] loop
    perform set_config('request.jwt.claim.sub', r, true); execute 'set local role authenticated';
    select count(*) into n0 from public.booking_message_locations where booking_id = bk; execute 'reset role';
    assert n0 = case when r in (stu::text, a1::text) then 1 else 0 end, 'RLS da localização: ' || r || ' vê ' || n0;
    perform set_config('request.jwt.claim.sub', r, true); execute 'set local role authenticated';
    select count(*) into n0 from public.booking_messages where booking_id = bk; execute 'reset role';
    assert n0 = case when r in (stu::text, a1::text) then 1 else 0 end, 'RLS das mensagens: ' || r || ' vê ' || n0;
  end loop;
  -- o instrutor responde (outro remetente; o limite de 2 s é por remetente): o ALUNO é avisado
  r := pg_temp.try(format('select public.send_booking_message(%L, ''Recebi sua localização, te espero lá'')', bk), a1);
  assert r = 'ok', 'instrutor responde: ' || r;
  assert pg_temp.got(stu, 'Nova mensagem sobre sua aula', '/aluno/atendimento/' || bk) = 1, 'o aluno é avisado, com link para a conversa';
  assert pg_temp.try(format('select public.send_booking_message(%L, ''de novo'')', bk), a1) like '55000:%', 'mensagens em rajada são recusadas (limite de 2 s por remetente)';

  -- notify_lesson_incident: o aluno relata; só o instrutor é avisado; terceiros não relatam
  update public.booking_meetings set starts_at = now() - interval '3 hours' where id = m1;
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''weather'', 30, ''Vento caiu muito durante a aula'')', bk, m1), oth);
  assert r like '42501:%', 'terceiro não relata imprevisto: ' || r;
  assert pg_temp.got(a1, 'Imprevisto registrado', '/instrutor/ocorrencias') = 0, 'nenhum aviso por relato recusado';
  r := pg_temp.try(format('select public.report_lesson_incident(%L, %L, ''weather'', 30, ''Vento caiu muito durante a aula'')', bk, m1), stu);
  assert r = 'ok', 'aluno relata: ' || r;
  assert pg_temp.got(a1, 'Imprevisto registrado', '/instrutor/ocorrencias') = 1, 'o instrutor é avisado do imprevisto';
  assert pg_temp.got(stu, 'Imprevisto registrado', '/aluno/ocorrencias') = 0, 'quem relatou não recebe o próprio aviso';

  -- notify_offer_transition: um pedido novo avisa o instrutor ofertado (e só ele)
  select count(*) into total0 from public.app_notifications where title = 'Nova solicitação de aula';
  d1 := pg_temp.free_slot(10, 90);
  perform set_config('request.jwt.claim.sub', oth::text, true); execute 'set local role authenticated';
  loc := public.create_instructor_request((select id from public.beaches where slug = 'jeri'), 'first_time', 'Português',
            jsonb_build_array(jsonb_build_object('starts_at', d1, 'hours', 1)), null, false);
  execute 'reset role';
  select instructor_id into offered from public.instructor_offers where request_id = loc order by created_at limit 1;
  if offered is not null then
    assert (select count(*) from public.app_notifications where title = 'Nova solicitação de aula') = total0 + 1, 'exatamente 1 aviso de oferta';
    assert pg_temp.got(offered, 'Nova solicitação de aula', '/instrutor/solicitacao') >= 1, 'o instrutor ofertado é avisado';
  end if;

  -- RLS dos avisos: cada um só enxerga os próprios
  assert pg_temp.sees(stu) = (select count(*)::int from public.app_notifications where recipient_id = stu), 'aluno enxerga só os próprios avisos';
  assert pg_temp.sees(a2) = (select count(*)::int from public.app_notifications where recipient_id = a2), 'instrutor a2 enxerga só os próprios avisos';
  assert pg_temp.try('update public.app_notifications set read_at = now()', stu) like '42501:%', 'cliente não atualiza avisos direto';
  assert pg_temp.try('delete from public.app_notifications', stu) like '42501:%', 'cliente não apaga avisos';
  assert pg_temp.try('insert into public.app_notifications(recipient_id,category,title,body,href) values (''' || a1 || ''',''booking'',''x'',''y'',''/x'')', stu) like '42501:%', 'cliente não cria aviso para outro';
end $$;
rollback;
select 'PASS: notify_* disparam e entregam ao destinatário certo mesmo sem EXECUTE; localização e mensagens só entre participantes; avisos isolados por RLS' as result;
