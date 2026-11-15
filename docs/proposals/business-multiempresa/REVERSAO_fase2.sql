-- Reversão da migration 20261115130000_business_services_bookings.sql.
-- SÓ use se ainda NÃO houver dados reais nas tabelas company_services/prices/bookings (apaga tudo delas).
-- Restaura a versão ORIGINAL de public.instructor_can_attend (migration 20261101000007), sem o bloco das
-- reservas presenciais. Não toca na fase 1 nem em nenhum objeto anterior.
begin;
create or replace function public.instructor_can_attend(p_id uuid,p_meetings jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v jsonb; st timestamptz; en timestamptz; local_st timestamp; local_en timestamp;
  buff integer:=0; configured boolean;
begin
  select buffer_minutes into buff from public.instructor_schedule_settings where instructor_id=p_id;
  configured:=found; buff:=coalesce(buff,0);
  if jsonb_typeof(p_meetings)<>'array' then return false; end if;
  for v in select value from jsonb_array_elements(p_meetings) loop
    st:=(v->>'starts_at')::timestamptz;
    en:=st+make_interval(hours=>(v->>'hours')::integer);
    local_st:=st at time zone 'America/Fortaleza';
    local_en:=en at time zone 'America/Fortaleza';
    if configured and not exists(select 1 from public.instructor_weekly_hours h
      where h.instructor_id=p_id and h.weekday=extract(dow from local_st)::integer
      and local_st::date=local_en::date and local_st::time>=h.opens_at
      and local_en::time<=h.closes_at) then return false; end if;
    if exists(select 1 from public.instructor_time_off t where t.instructor_id=p_id
      and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(st,en,'[)'))
    then return false; end if;
    if exists(select 1 from public.booking_meetings m join public.bookings b on b.id=m.booking_id
      where b.instructor_id=p_id and m.status<>'cancelled'
      and (b.status='confirmed' or (b.status='awaiting_payment'
          and b.created_at>=now()-interval '10 minutes'))
      and tstzrange(m.starts_at-make_interval(mins=>buff),
        m.starts_at+make_interval(mins=>m.minutes+buff),'[)') && tstzrange(st,en,'[)'))
    then return false; end if;
  end loop;
  return true;
end $$;
drop function if exists public.instructor_busy_intervals(uuid, timestamptz, timestamptz), public.complete_external_booking(uuid), public.cancel_external_booking(uuid, text),
  public.reschedule_external_booking(uuid, timestamptz), public.create_external_booking(uuid, uuid, uuid, text, text, timestamptz), public.set_package_active(uuid, boolean),
  public.create_package(uuid, text, integer, integer, integer), public.set_unit_service(uuid, uuid, text, smallint[], uuid[], boolean), public.set_service_price(uuid, uuid, integer),
  public.create_service(uuid, text, integer, integer, text, integer), public.company_check_slot(uuid, uuid, uuid, timestamptz, uuid),
  public.company_instructor_is_free(uuid, timestamptz, integer, uuid), public.company_rate_bps(uuid, uuid, date), public.company_service_price_cents(uuid, uuid, date) cascade;
drop table if exists public.company_external_bookings, public.company_packages, public.company_unit_service_instructors, public.company_unit_services, public.company_service_prices, public.company_services cascade;
drop function if exists public.company_bookings_frozen() cascade;
drop sequence if exists public.company_booking_seq;
drop type if exists public.company_booking_status;
notify pgrst, 'reload schema';
commit;
