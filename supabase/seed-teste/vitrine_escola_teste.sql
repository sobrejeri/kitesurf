-- SEED DE TESTE: uma escola com loja pública completa. SÓ para projeto Supabase de TESTE (fases 1 a 7 aplicadas). Nunca em produção.
-- Antes: crie 3 contas pelo painel (Authentication > Users), com e-mail CONFIRMADO, e troque os e-mails abaixo:
--   dono (conta de aluno comum), instrutor (cadastre como instrutor) e admin (um perfil já admin; 2FA aal2 é simulado aqui).
-- Rode no SQL Editor. Roda uma vez por projeto (cria a empresa 'Escola Teste Vitrine'); resultado: /escola/escola-teste-vitrine.
do $seed$
declare
  v_owner_email text := 'dono-teste@exemplo.com';
  v_instr_email text := 'instrutor-teste@exemplo.com';
  v_admin_email text := 'admin-teste@exemplo.com';
  o uuid; ins uuid; adm uuid; a uuid; u1 uuid; inv uuid; ilink uuid; svc uuid; p1 uuid;
  slug constant text := 'escola-teste-vitrine';
begin
  select id into o from auth.users where lower(email) = lower(v_owner_email) and email_confirmed_at is not null;
  select id into ins from auth.users where lower(email) = lower(v_instr_email) and email_confirmed_at is not null;
  select id into adm from auth.users where lower(email) = lower(v_admin_email) and email_confirmed_at is not null;
  if o is null or ins is null or adm is null then raise exception 'Crie as 3 contas com e-mail confirmado e ajuste os e-mails no topo do script'; end if;
  if (select role from public.profiles where id = adm) <> 'admin' then raise exception 'A conta admin precisa ter perfil admin'; end if;
  if exists (select 1 from public.company_store_settings where public_slug = slug) then raise exception 'Seed já aplicado'; end if;
  update public.instructors set status = 'approved', approved_at = coalesce(approved_at, now()) where id = ins;

  -- Cada passo roda como a pessoa certa, pelas MESMAS funções do app (nada de INSERT direto).
  perform set_config('request.jwt.claim.sub', o::text, true); perform set_config('request.jwt.claim.aal', 'aal2', true); set local role authenticated;
  a := public.create_company('Escola Teste Vitrine Ltda', 'Escola Teste', '11222333000181');
  reset role;
  perform set_config('request.jwt.claim.sub', adm::text, true); set local role authenticated;
  perform public.admin_set_company_status(a, 'active', 'Seed de teste');
  reset role;
  perform set_config('request.jwt.claim.sub', o::text, true); set local role authenticated;
  u1 := public.create_unit(a, 'Preá Beach', 'Cruz', 'Av. da Praia, 120', null, null, '06:00', '20:00');
  inv := public.invite_instructor(a, v_instr_email, array[u1], 5500);
  reset role;
  perform set_config('request.jwt.claim.sub', ins::text, true); set local role authenticated;
  perform public.accept_company_invitation(inv);
  perform public.save_my_schedule(array[0,1,2,3,4,5,6], '07:00', '18:00', 0);
  reset role;
  select id into ilink from public.company_instructor_links where company_id = a;
  perform set_config('request.jwt.claim.sub', o::text, true); set local role authenticated;
  svc := public.create_service(a, 'Aula iniciante', 120, 2, 'Primeiro contato com a pipa', 26000);
  perform public.set_unit_service(svc, u1, 'Praia do Preá, ponto 2', array[0,1,2,3,4,5,6]::smallint[], array[ilink], true);
  p1 := public.create_product(a, 'BON-TST', 'Boné VentoKite', 'Vestuário', 4500, 0);
  perform public.record_stock_movement(u1, p1, 'in', 10, 'Estoque inicial do teste');
  perform public.create_equipment(u1, 'PR-01', 'prancha', 'Prancha twin tip 138', 'bom');
  perform public.set_rental_rate(a, 'prancha', 4000);
  perform public.set_store_settings(a, 'Escola Teste', 'Aulas em Preá (loja de teste)', '(88) 99999-0000', 'azul');
  perform public.create_coupon(a, 'TESTE10', 'percent', 1000, 0, 60, 50);
  perform public.set_store_public(a, slug, true);
  reset role;
  raise notice 'Pronto: abra /escola/% . Empresa: %', slug, a;
end
$seed$;
