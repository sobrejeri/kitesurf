-- Comprovantes externos: um arquivo privado por pagamento, sem sobrescrita.
-- A escola continua responsável por efetuar o pagamento fora da plataforma.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vento-business-payment-receipts', 'vento-business-payment-receipts', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png']);

-- Caminho fixo por pagamento. SECURITY DEFINER é necessário para verificar o
-- pagamento inclusive para usuários com finance.edit sem finance.reports.
-- Nenhum nome, valor ou existência de pagamento é retornado pela função.
create function public.business_payment_receipt_access(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p public.company_instructor_payments;
begin
  if auth.uid() is null or p_write is null or p_name is null
     or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/comprovante$' then
    return false;
  end if;
  select * into p from public.company_instructor_payments where id = split_part(p_name, '/', 1)::uuid;
  if not found then return false; end if;
  if p_write then
    return p.voided_at is null and public.company_any_permission(p.company_id, 'finance.edit');
  end if;
  return p.instructor_id = auth.uid()
    or public.company_any_permission(p.company_id, 'finance.reports')
    or public.company_any_permission(p.company_id, 'finance.edit');
end;
$$;

revoke all on function public.business_payment_receipt_access(text, boolean) from public, anon, authenticated;
grant execute on function public.business_payment_receipt_access(text, boolean) to authenticated;

create policy vento_business_payment_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'vento-business-payment-receipts' and public.business_payment_receipt_access(name, false));
create policy vento_business_payment_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vento-business-payment-receipts' and public.business_payment_receipt_access(name, true));
-- Sem UPDATE/DELETE: não substituir nem apagar comprovantes financeiros.

commit;
