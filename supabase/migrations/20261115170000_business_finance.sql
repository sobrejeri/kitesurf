-- Vento | Business fase 6: financeiro. Lançamentos de receita e despesa, contas a receber e a
-- pagar, pagamentos externos aos instrutores (com confirmação de recebimento pelo instrutor) e
-- resumo por período.
--
-- Depende das fases 1 a 5. Só cria objetos novos e acrescenta uma permissão ao catálogo; não altera
-- nenhuma função nem tabela anterior.
--
-- Regras do projeto:
--  * A escola paga o instrutor FORA do VentoKite (Pix, TED ou dinheiro). Aqui fica só o REGISTRO:
--    nada é transferido, cobrado nem repassado automaticamente pela plataforma.
--  * O devido ao instrutor é a soma das comissões CONGELADAS das reservas presenciais concluídas
--    (fase 2). Um pagamento nunca passa do saldo devido, nem com registros simultâneos.
--  * O instrutor confirma o recebimento com a própria conta, uma vez. Pagamento confirmado não
--    muda; registro errado ainda não confirmado é anulado com motivo (nunca apagado).
--  * Lançamentos são append-only: corrigir é estornar com um lançamento inverso, uma vez.
--  * Baixas de contas a receber e a pagar nunca passam do valor da conta.
--  * Dinheiro em centavos inteiros; datas no fuso de Fortaleza.
--  * Escrita só por função SECURITY DEFINER; tabelas sem INSERT/UPDATE/DELETE para o cliente; RLS em todas.
begin;

insert into public.company_permissions (id, sensitive) values ('finance.edit', true);
insert into public.company_role_permissions (role, permission) values ('finance', 'finance.edit');

-- ---------------------------------------------------------------------------
-- Lançamentos de receita e despesa (append-only)
-- ---------------------------------------------------------------------------
create table public.company_fin_entries (
  id bigserial primary key,
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  kind text not null check (kind in ('revenue', 'expense')),
  category text not null check (char_length(category) between 2 and 40),
  cents integer not null check (cents <> 0 and cents between -100000000 and 100000000),
  entry_date date not null,
  note text not null check (char_length(note) between 3 and 160),
  reverses_id bigint unique references public.company_fin_entries (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Valor negativo só existe num estorno, que aponta para o lançamento original.
  constraint company_fin_entries_sign check ((reverses_id is null and cents > 0) or (reverses_id is not null and cents < 0))
);
create index company_fin_entries_unit_idx on public.company_fin_entries (unit_id, entry_date desc);
create trigger company_fin_entries_append_only before update or delete on public.company_fin_entries for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Contas a receber e a pagar, e suas baixas
-- ---------------------------------------------------------------------------
create table public.company_dues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  unit_id uuid not null references public.company_units (id),
  kind text not null check (kind in ('receivable', 'payable')),
  party text not null check (char_length(party) between 2 and 80),
  due_date date not null,
  cents integer not null check (cents between 1 and 100000000),
  note text not null default '' check (char_length(note) <= 160),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text,
  constraint company_dues_cancel_consistent check ((cancelled_at is null) = (cancel_reason is null))
);
create index company_dues_unit_idx on public.company_dues (unit_id, due_date);

create table public.company_due_payments (
  id bigserial primary key,
  due_id uuid not null references public.company_dues (id),
  cents integer not null check (cents between 1 and 100000000),
  paid_on date not null,
  note text not null default '' check (char_length(note) <= 160),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index company_due_payments_due_idx on public.company_due_payments (due_id);

-- A conta só muda para cancelada (uma vez); o resto é congelado.
create function public.company_dues_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.cancelled_at is not null then raise exception 'A cancelled account cannot change' using errcode = 'insufficient_privilege'; end if;
  if (new.id, new.company_id, new.unit_id, new.kind, new.party, new.due_date, new.cents, new.note, new.created_by, new.created_at)
     is distinct from (old.id, old.company_id, old.unit_id, old.kind, old.party, old.due_date, old.cents, old.note, old.created_by, old.created_at) then
    raise exception 'An account is frozen' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger company_dues_frozen before update on public.company_dues for each row execute function public.company_dues_guard();
create trigger company_dues_no_delete before delete on public.company_dues for each row execute function public.reject_change();

-- A baixa trava a conta, então duas baixas simultâneas se enfileiram e a soma nunca passa do valor.
create function public.company_due_payment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.company_dues; paid bigint;
begin
  select * into d from public.company_dues where id = new.due_id for update;
  if d.id is null or d.cancelled_at is not null then raise exception 'The account is not open' using errcode = '55000'; end if;
  select coalesce(sum(cents), 0) into paid from public.company_due_payments where due_id = new.due_id;
  if paid + new.cents > d.cents then raise exception 'Payment above the open amount' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger company_due_payments_within before insert on public.company_due_payments for each row execute function public.company_due_payment_guard();
create trigger company_due_payments_append_only before update or delete on public.company_due_payments for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Pagamentos externos aos instrutores (só registro)
-- ---------------------------------------------------------------------------
create table public.company_instructor_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  link_id uuid not null references public.company_instructor_links (id),
  instructor_id uuid not null references public.instructors (id),
  cents integer not null check (cents between 1 and 100000000),
  method text not null check (method in ('pix', 'ted', 'cash')),
  reference text not null check (char_length(reference) between 3 and 80),
  paid_on date not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  constraint company_instructor_payments_void_consistent check ((voided_at is null) = (void_reason is null) and (voided_at is null) = (voided_by is null)),
  constraint company_instructor_payments_not_both check (confirmed_at is null or voided_at is null)
);
create index company_instructor_payments_link_idx on public.company_instructor_payments (link_id, paid_on desc);

-- Do pagamento só mudam a confirmação (uma vez) ou a anulação (uma vez, se não confirmado).
create function public.company_instructor_payments_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.company_id, new.link_id, new.instructor_id, new.cents, new.method, new.reference, new.paid_on, new.created_by, new.created_at)
     is distinct from (old.id, old.company_id, old.link_id, old.instructor_id, old.cents, old.method, old.reference, old.paid_on, old.created_by, old.created_at) then
    raise exception 'A payment record is frozen' using errcode = 'insufficient_privilege';
  end if;
  if old.confirmed_at is not null or old.voided_at is not null then raise exception 'A confirmed or voided payment cannot change' using errcode = 'insufficient_privilege'; end if;
  return new;
end;
$$;
create trigger company_instructor_payments_frozen before update on public.company_instructor_payments for each row execute function public.company_instructor_payments_guard();
create trigger company_instructor_payments_no_delete before delete on public.company_instructor_payments for each row execute function public.reject_change();

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------
create function public.company_instructor_due_cents(p_link uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(commission_cents), 0) from public.company_external_bookings where link_id = p_link and status = 'done';
$$;
create function public.company_instructor_paid_cents(p_link uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cents), 0) from public.company_instructor_payments where link_id = p_link and voided_at is null;
$$;
-- O pagamento nunca passa do saldo. A função de registro trava o vínculo; este gatilho vale também para inserção direta.
create function public.company_instructor_payment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.company_instructor_links;
begin
  select * into l from public.company_instructor_links where id = new.link_id for update;
  if l.id is null or l.company_id <> new.company_id or l.instructor_id <> new.instructor_id then raise exception 'Payment does not match the instructor link' using errcode = '22023'; end if;
  if public.company_instructor_paid_cents(new.link_id) + new.cents > public.company_instructor_due_cents(new.link_id) then
    raise exception 'Payment above the amount owed' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger company_instructor_payments_within before insert on public.company_instructor_payments for each row execute function public.company_instructor_payment_guard();

-- ---------------------------------------------------------------------------
-- Escritas
-- ---------------------------------------------------------------------------
create function public.record_fin_entry(p_unit uuid, p_kind text, p_category text, p_cents integer, p_date date, p_note text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; eid bigint; today date := (now() at time zone 'America/Fortaleza')::date;
begin
  select * into u from public.company_units where id = p_unit;
  if u.id is null then raise exception 'Unit not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(p_unit, 'finance.edit');
  if p_cents is null or p_cents < 1 then raise exception 'Invalid amount' using errcode = '22023'; end if;
  if p_date is null or p_date > today or p_date < today - 366 then raise exception 'Date from the last year, not in the future' using errcode = '22023'; end if;
  insert into public.company_fin_entries (company_id, unit_id, kind, category, cents, entry_date, note, created_by)
    values (u.company_id, p_unit, p_kind, trim(coalesce(p_category, '')), p_cents, p_date, trim(coalesce(p_note, '')), auth.uid()) returning id into eid;
  perform public.company_audit(u.company_id, p_unit, 'finance.entry', p_kind, jsonb_build_object('cents', p_cents, 'category', trim(p_category)));
  return eid;
end;
$$;
-- Estorno: um lançamento inverso, uma vez por lançamento. Nada é editado nem apagado.
create function public.reverse_fin_entry(p_entry bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare e public.company_fin_entries; rid bigint;
begin
  select * into e from public.company_fin_entries where id = p_entry;
  if not found then raise exception 'Entry not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(e.unit_id, 'finance.edit');
  if e.reverses_id is not null then raise exception 'A reversal is not reversed' using errcode = '55000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  insert into public.company_fin_entries (company_id, unit_id, kind, category, cents, entry_date, note, reverses_id, created_by)
    values (e.company_id, e.unit_id, e.kind, e.category, -e.cents, (now() at time zone 'America/Fortaleza')::date, left('Estorno: ' || trim(p_reason), 160), e.id, auth.uid()) returning id into rid;
  perform public.company_audit(e.company_id, e.unit_id, 'finance.reversal', e.id::text, jsonb_build_object('cents', -e.cents));
  return rid;
end;
$$;

create function public.create_due(p_unit uuid, p_kind text, p_party text, p_due_date date, p_cents integer, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u public.company_units; did uuid;
begin
  select * into u from public.company_units where id = p_unit;
  if u.id is null then raise exception 'Unit not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(p_unit, 'finance.edit');
  insert into public.company_dues (company_id, unit_id, kind, party, due_date, cents, note, created_by)
    values (u.company_id, p_unit, p_kind, trim(coalesce(p_party, '')), p_due_date, p_cents, coalesce(trim(p_note), ''), auth.uid()) returning id into did;
  perform public.company_audit(u.company_id, p_unit, 'finance.due', p_kind, jsonb_build_object('cents', p_cents));
  return did;
end;
$$;
create function public.record_due_payment(p_due uuid, p_cents integer, p_paid_on date, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.company_dues; today date := (now() at time zone 'America/Fortaleza')::date;
begin
  select * into d from public.company_dues where id = p_due for update;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(d.unit_id, 'finance.edit');
  if p_paid_on is null or p_paid_on > today then raise exception 'The payment date cannot be in the future' using errcode = '22023'; end if;
  insert into public.company_due_payments (due_id, cents, paid_on, note, created_by) values (p_due, p_cents, p_paid_on, coalesce(trim(p_note), ''), auth.uid());
  perform public.company_audit(d.company_id, d.unit_id, 'finance.due_payment', d.id::text, jsonb_build_object('cents', p_cents));
end;
$$;
create function public.cancel_due(p_due uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.company_dues;
begin
  select * into d from public.company_dues where id = p_due for update;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
  perform public.require_company_permission(d.unit_id, 'finance.edit');
  if d.cancelled_at is not null then raise exception 'Already cancelled' using errcode = '55000'; end if;
  if exists (select 1 from public.company_due_payments where due_id = p_due) then raise exception 'An account with payments is not cancelled' using errcode = '55000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_dues set cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_due;
  perform public.company_audit(d.company_id, d.unit_id, 'finance.due_cancelled', d.id::text);
end;
$$;

-- Registro de um pagamento feito pela escola FORA do VentoKite. Nunca acima do saldo devido.
create function public.record_instructor_payment(p_link uuid, p_cents integer, p_method text, p_reference text, p_paid_on date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare l public.company_instructor_links; pid uuid; today date := (now() at time zone 'America/Fortaleza')::date; d date := coalesce(p_paid_on, (now() at time zone 'America/Fortaleza')::date);
begin
  select * into l from public.company_instructor_links where id = p_link for update;
  if not found then raise exception 'Instructor link not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(l.company_id, 'finance.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_cents is null or p_cents < 1 then raise exception 'Invalid amount' using errcode = '22023'; end if;
  if d > today then raise exception 'The payment date cannot be in the future' using errcode = '22023'; end if;
  insert into public.company_instructor_payments (company_id, link_id, instructor_id, cents, method, reference, paid_on, created_by)
    values (l.company_id, l.id, l.instructor_id, p_cents, p_method, trim(coalesce(p_reference, '')), d, auth.uid()) returning id into pid;
  perform public.company_audit(l.company_id, null, 'finance.instructor_payment', pid::text, jsonb_build_object('cents', p_cents, 'method', p_method));
  return pid;
end;
$$;
-- Só o próprio instrutor confirma que recebeu, uma vez.
create function public.confirm_instructor_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.company_instructor_payments;
begin
  select * into p from public.company_instructor_payments where id = p_payment for update;
  if not found or auth.uid() is null or p.instructor_id <> auth.uid() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.voided_at is not null then raise exception 'This payment record was voided' using errcode = '55000'; end if;
  if p.confirmed_at is not null then raise exception 'Already confirmed' using errcode = '55000'; end if;
  update public.company_instructor_payments set confirmed_at = now() where id = p_payment;
  perform public.company_audit(p.company_id, null, 'finance.instructor_payment_confirmed', p.id::text);
end;
$$;
-- Anula um registro errado que o instrutor ainda não confirmou. O registro fica, marcado como anulado.
create function public.void_instructor_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.company_instructor_payments;
begin
  select * into p from public.company_instructor_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if not public.company_any_permission(p.company_id, 'finance.edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.confirmed_at is not null then raise exception 'A confirmed payment is not voided' using errcode = '55000'; end if;
  if p.voided_at is not null then raise exception 'Already voided' using errcode = '55000'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.company_instructor_payments set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_payment;
  perform public.company_audit(p.company_id, null, 'finance.instructor_payment_voided', p.id::text, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Leituras
-- ---------------------------------------------------------------------------
-- Saldo de um vínculo: para o financeiro da empresa ou para o próprio instrutor.
create function public.instructor_balance(p_link uuid)
returns table (due_cents bigint, paid_cents bigint, balance_cents bigint, unconfirmed_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare l public.company_instructor_links;
begin
  select * into l from public.company_instructor_links where id = p_link;
  if l.id is null or auth.uid() is null or not (l.instructor_id = auth.uid() or public.company_any_permission(l.company_id, 'finance.reports') or public.is_admin()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select public.company_instructor_due_cents(p_link), public.company_instructor_paid_cents(p_link),
    public.company_instructor_due_cents(p_link) - public.company_instructor_paid_cents(p_link),
    (select coalesce(sum(cents), 0)::bigint from public.company_instructor_payments where link_id = p_link and voided_at is null and confirmed_at is null);
end;
$$;
-- O que as escolas devem e já pagaram ao instrutor logado. Sem dados de clientes.
create function public.my_company_earnings()
returns table (company_id uuid, company_name text, link_id uuid, due_cents bigint, paid_cents bigint, balance_cents bigint, unconfirmed_cents bigint)
language sql stable security definer set search_path = '' as $$
  select l.company_id, c.trade_name, l.id, public.company_instructor_due_cents(l.id), public.company_instructor_paid_cents(l.id),
         public.company_instructor_due_cents(l.id) - public.company_instructor_paid_cents(l.id),
         (select coalesce(sum(p.cents), 0)::bigint from public.company_instructor_payments p where p.link_id = l.id and p.voided_at is null and p.confirmed_at is null)
  from public.company_instructor_links l join public.companies c on c.id = l.company_id
  where auth.uid() is not null and l.instructor_id = auth.uid()
  order by c.trade_name;
$$;
-- Situação de uma conta: paga, parcial, vencida, aberta ou cancelada.
create function public.company_due_status(p_cents integer, p_paid bigint, p_due_date date, p_cancelled boolean) returns text
language sql stable set search_path = '' as $$
  select case when p_cancelled then 'cancelled' when p_paid >= p_cents then 'paid'
    when p_due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue' when p_paid > 0 then 'partial' else 'open' end;
$$;
-- Resumo por unidade num período: só as unidades em que a pessoa vê relatórios financeiros.
-- Receita = vendas do caixa (dinheiro, Pix e cartão registrados) + lançamentos de receita.
-- Despesa = despesas do caixa + lançamentos de despesa. Comissão = reservas presenciais concluídas no período.
create function public.company_finance_summary(p_company uuid, p_from date, p_to date)
returns table (unit_id uuid, revenue_cents bigint, expense_cents bigint, instructor_commission_cents bigint, result_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Invalid period' using errcode = '22023'; end if;
  return query
  select u.id, x.rev, x.exp, x.com, x.rev - x.exp - x.com
  from public.company_units u
  cross join lateral (select
      (select coalesce(sum(m.cents), 0) from public.company_cash_movements m where m.unit_id = u.id and m.kind = 'sale' and (m.created_at at time zone 'America/Fortaleza')::date between p_from and p_to)
      + (select coalesce(sum(e.cents), 0) from public.company_fin_entries e where e.unit_id = u.id and e.kind = 'revenue' and e.entry_date between p_from and p_to) as rev,
      (select coalesce(sum(m.cents), 0) from public.company_cash_movements m where m.unit_id = u.id and m.kind = 'expense' and (m.created_at at time zone 'America/Fortaleza')::date between p_from and p_to)
      + (select coalesce(sum(e.cents), 0) from public.company_fin_entries e where e.unit_id = u.id and e.kind = 'expense' and e.entry_date between p_from and p_to) as exp,
      (select coalesce(sum(b.commission_cents), 0) from public.company_external_bookings b where b.unit_id = u.id and b.status = 'done' and (b.starts_at at time zone 'America/Fortaleza')::date between p_from and p_to) as com
    ) x
  where u.company_id = p_company and (public.company_has_permission(u.id, 'finance.reports') or public.is_admin())
  order by u.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS e concessões
-- ---------------------------------------------------------------------------
alter table public.company_fin_entries enable row level security;
alter table public.company_dues enable row level security;
alter table public.company_due_payments enable row level security;
alter table public.company_instructor_payments enable row level security;

create policy company_fin_entries_select on public.company_fin_entries for select to authenticated
  using (public.company_has_permission(unit_id, 'finance.reports') or public.is_admin());
create policy company_dues_select on public.company_dues for select to authenticated
  using (public.company_has_permission(unit_id, 'finance.reports') or public.is_admin());
create policy company_due_payments_select on public.company_due_payments for select to authenticated
  using (exists (select 1 from public.company_dues d where d.id = due_id));
create policy company_instructor_payments_select on public.company_instructor_payments for select to authenticated
  using (instructor_id = auth.uid() or public.company_any_permission(company_id, 'finance.reports') or public.is_admin());

revoke all on public.company_fin_entries, public.company_dues, public.company_due_payments, public.company_instructor_payments from public, anon, authenticated;
grant select on public.company_fin_entries, public.company_dues, public.company_due_payments, public.company_instructor_payments to authenticated;
revoke all on sequence public.company_fin_entries_id_seq, public.company_due_payments_id_seq from public, anon, authenticated;

revoke all on function public.company_dues_guard(), public.company_due_payment_guard(), public.company_instructor_payments_guard(), public.company_instructor_payment_guard(),
  public.company_instructor_due_cents(uuid), public.company_instructor_paid_cents(uuid), public.record_fin_entry(uuid, text, text, integer, date, text),
  public.reverse_fin_entry(bigint, text), public.create_due(uuid, text, text, date, integer, text), public.record_due_payment(uuid, integer, date, text),
  public.cancel_due(uuid, text), public.record_instructor_payment(uuid, integer, text, text, date), public.confirm_instructor_payment(uuid),
  public.void_instructor_payment(uuid, text), public.instructor_balance(uuid), public.my_company_earnings(),
  public.company_due_status(integer, bigint, date, boolean), public.company_finance_summary(uuid, date, date) from public, anon, authenticated;
grant execute on function public.record_fin_entry(uuid, text, text, integer, date, text), public.reverse_fin_entry(bigint, text),
  public.create_due(uuid, text, text, date, integer, text), public.record_due_payment(uuid, integer, date, text), public.cancel_due(uuid, text),
  public.record_instructor_payment(uuid, integer, text, text, date), public.confirm_instructor_payment(uuid), public.void_instructor_payment(uuid, text),
  public.instructor_balance(uuid), public.my_company_earnings(), public.company_due_status(integer, bigint, date, boolean),
  public.company_finance_summary(uuid, date, date) to authenticated;
-- Internas (sem EXECUTE para o cliente): os quatro gatilhos, company_instructor_due_cents e company_instructor_paid_cents.

notify pgrst, 'reload schema';
commit;
