-- Reversão da migration 20261115170000_business_finance.sql.
-- SÓ use se ainda NÃO houver lançamentos, contas ou pagamentos a instrutores reais (apaga tudo isso).
-- Remove também a permissão finance.edit. Não toca nas fases 1 a 5.
begin;
drop function if exists public.company_finance_summary(uuid, date, date), public.company_due_status(integer, bigint, date, boolean), public.my_company_earnings(),
  public.instructor_balance(uuid), public.void_instructor_payment(uuid, text), public.confirm_instructor_payment(uuid),
  public.record_instructor_payment(uuid, integer, text, text, date), public.cancel_due(uuid, text), public.record_due_payment(uuid, integer, date, text),
  public.create_due(uuid, text, text, date, integer, text), public.reverse_fin_entry(bigint, text), public.record_fin_entry(uuid, text, text, integer, date, text) cascade;
drop table if exists public.company_instructor_payments, public.company_due_payments, public.company_dues, public.company_fin_entries cascade;
drop function if exists public.company_instructor_payment_guard(), public.company_instructor_payments_guard(), public.company_due_payment_guard(), public.company_dues_guard(),
  public.company_instructor_paid_cents(uuid), public.company_instructor_due_cents(uuid) cascade;
delete from public.company_member_overrides where permission = 'finance.edit';
delete from public.company_role_permissions where permission = 'finance.edit';
delete from public.company_permissions where id = 'finance.edit';
notify pgrst, 'reload schema';
commit;
