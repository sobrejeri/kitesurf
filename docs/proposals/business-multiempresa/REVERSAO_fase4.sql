-- Reversão da migration 20261115150000_business_cash.sql.
-- SÓ use se ainda NÃO houver caixas, movimentos ou arquivos de fechamento reais (apaga tudo isso).
-- Remove as políticas e o bucket privado 'vento-business-closings' (o bucket precisa estar VAZIO; se houver
-- arquivos, a remoção do bucket falha e nada é revertido). Não toca nas fases 1, 2 e 3.
begin;
drop policy if exists vento_business_closings_read on storage.objects;
drop policy if exists vento_business_closings_insert on storage.objects;
delete from storage.buckets where id = 'vento-business-closings';
drop function if exists public.cash_session_totals(uuid), public.register_closing_file(uuid, text, text, integer), public.close_cash_session(uuid, integer, text),
  public.record_rental_payment(uuid, uuid, public.company_cash_method), public.record_booking_payment(uuid, uuid, public.company_cash_method),
  public.sell_product(uuid, uuid, integer, public.company_cash_method), public.record_cash_movement(uuid, public.company_cash_kind, integer, text),
  public.open_cash_session(uuid, integer, text), public.set_cash_settings(uuid, public.company_closing_mode, integer, text[]),
  public.company_closing_object_access(text, boolean), public.company_cash_lock(uuid, text), public.company_cash_expected(uuid) cascade;
drop table if exists public.company_cash_closing_files, public.company_cash_movements, public.company_cash_sessions, public.company_cash_settings cascade;
drop function if exists public.company_cash_movement_guard() cascade;
drop function if exists public.company_cash_sessions_guard() cascade;
drop type if exists public.company_session_status, public.company_cash_method, public.company_cash_kind, public.company_closing_mode;
notify pgrst, 'reload schema';
commit;
