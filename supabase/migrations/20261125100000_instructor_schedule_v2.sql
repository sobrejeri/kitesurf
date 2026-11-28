-- #91 Módulo 2 — Agenda e disponibilidade (additive; nada de migration aplicada é editado).
--  1. Pausas semanais (intervalo de almoço) e horários extras por data; tipos de bloqueio (bloqueio, folga, férias).
--  2. Uma regra única de "horário aberto" (instructor_slot_open) usada por instructor_can_attend E por can_move_meeting
--     (antes as duas repetiam a regra; mudar uma deixava a outra desatualizada).
--  3. Escritas de agenda serializadas pela linha do instrutor (a mesma que create_booking trava com FOR UPDATE SKIP LOCKED).
--  4. Barreira no banco contra dois encontros ativos sobrepostos do mesmo instrutor (inclusive troca de instrutor e ativação).
--  5. Reconciliação: ao mudar a agenda, ofertas abertas que deixaram de caber são devolvidas à fila; aulas confirmadas
--     fora do novo turno são APENAS listadas (nunca apagadas nem movidas).
-- Ordem canônica de locks: instrutor -> reserva -> encontro. Aplicar só depois da revisão e com backup verificado.
begin;

-- 1. Estrutura ------------------------------------------------------------------------------------------------------
create table if not exists public.instructor_weekly_breaks (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructor_schedule_settings(instructor_id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at),
  unique (instructor_id, weekday, starts_at)
);
create table if not exists public.instructor_extra_hours (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  day date not null,
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  check (opens_at < closes_at),
  unique (instructor_id, day)
);
alter table public.instructor_time_off
  add column if not exists kind text not null default 'block' check (kind in ('block', 'day_off', 'vacation'));

alter table public.instructor_weekly_breaks enable row level security;
alter table public.instructor_extra_hours enable row level security;
revoke all on public.instructor_weekly_breaks, public.instructor_extra_hours from public, anon, authenticated;
grant select on public.instructor_weekly_breaks, public.instructor_extra_hours to authenticated;
drop policy if exists breaks_self on public.instructor_weekly_breaks;
create policy breaks_self on public.instructor_weekly_breaks for select to authenticated
  using (instructor_id = auth.uid() or public.is_admin());
drop policy if exists extra_hours_self on public.instructor_extra_hours;
create policy extra_hours_self on public.instructor_extra_hours for select to authenticated
  using (instructor_id = auth.uid() or public.is_admin());

-- 2. Regra única de horário aberto (turno semanal - pausas, ou horário extra da data, menos bloqueios) ---------------------
create function public.instructor_slot_open(p_id uuid, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  ls timestamp := p_start at time zone 'America/Fortaleza';
  le timestamp := p_end at time zone 'America/Fortaleza';
  v_configured boolean;
begin
  if p_start is null or p_end is null or p_end <= p_start then return false; end if;
  select true into v_configured from public.instructor_schedule_settings where instructor_id = p_id;
  if coalesce(v_configured, false) then
    if ls::date <> le::date then return false; end if;      -- encontro não atravessa a meia-noite local
    if not (
      exists (select 1 from public.instructor_weekly_hours h
               where h.instructor_id = p_id and h.weekday = extract(dow from ls)::integer
                 and ls::time >= h.opens_at and le::time <= h.closes_at
                 and not exists (select 1 from public.instructor_weekly_breaks br
                                  where br.instructor_id = p_id and br.weekday = h.weekday
                                    and br.starts_at < le::time and br.ends_at > ls::time))
      or exists (select 1 from public.instructor_extra_hours x
                  where x.instructor_id = p_id and x.day = ls::date
                    and ls::time >= x.opens_at and le::time <= x.closes_at)
    ) then return false; end if;
  end if;
  if exists (select 1 from public.instructor_time_off t
              where t.instructor_id = p_id and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, p_end, '[)')) then
    return false;
  end if;
  return true;
end $$;
revoke all on function public.instructor_slot_open(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- CREATE OR REPLACE preserva dono e ACL (fechadas à API).
create or replace function public.instructor_can_attend(p_id uuid, p_meetings jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; st timestamptz; en timestamptz; buff integer := 0;
begin
  select buffer_minutes into buff from public.instructor_schedule_settings where instructor_id = p_id;
  buff := coalesce(buff, 0);
  if jsonb_typeof(p_meetings) <> 'array' then return false; end if;
  for v in select value from jsonb_array_elements(p_meetings) loop
    st := (v->>'starts_at')::timestamptz;
    en := st + make_interval(hours => (v->>'hours')::integer);
    if not public.instructor_slot_open(p_id, st, en) then return false; end if;
    if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
                where b.instructor_id = p_id and m.status <> 'cancelled'
                  and (b.status = 'confirmed' or (b.status = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes'))
                  and tstzrange(m.starts_at - make_interval(mins => buff),
                                m.starts_at + make_interval(mins => m.minutes + buff), '[)') && tstzrange(st, en, '[)'))
    then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.can_move_meeting(p_instructor uuid, p_meeting uuid, p_start timestamptz, p_minutes integer)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_end timestamptz := p_start + make_interval(mins => p_minutes); v_buffer integer := 0;
begin
  select buffer_minutes into v_buffer from public.instructor_schedule_settings where instructor_id = p_instructor;
  v_buffer := coalesce(v_buffer, 0);
  if not public.instructor_slot_open(p_instructor, p_start, v_end) then return false; end if;
  -- Ignora o próprio encontro que está sendo remarcado.
  if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
              where b.instructor_id = p_instructor and m.id <> p_meeting and m.status <> 'cancelled'
                and (b.status = 'confirmed' or (b.status = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes'))
                and tstzrange(m.starts_at - make_interval(mins => v_buffer),
                              m.starts_at + make_interval(mins => m.minutes + v_buffer), '[)') && tstzrange(p_start, v_end, '[)'))
  then return false; end if;
  return true;
end $$;

-- 3. Reconciliação (interna) e conflitos (somente leitura, do próprio instrutor) -------------------------------------------
create function public.reconcile_instructor_availability(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record; h record; v_advanced integer := 0; v_conflicts integer; v_buffer integer;
begin
  -- Decisão do responsável (26/11): recusar a mudança, nunca cancelar uma retenção ativa.
  -- O chamador já trava o instrutor. A leitura não trava a reserva: confirmação de validação
  -- trava reserva antes de atualizar o instrutor. Só recusamos, sem mutar a retenção;
  -- uma recusa desfaz a edição inteira antes de qualquer avanço de oferta.
  select coalesce(buffer_minutes,0) into v_buffer from public.instructor_schedule_settings where instructor_id=p_id;
  v_buffer:=coalesce(v_buffer,0);
  for h in select b.id from public.bookings b
            where b.instructor_id = p_id and b.status = 'awaiting_payment'
              and b.created_at >= now() - interval '10 minutes'
              and exists (select 1 from public.booking_meetings m where m.booking_id = b.id and m.status = 'scheduled'
                           and (not public.instructor_slot_open(p_id, m.starts_at, m.starts_at + make_interval(mins => m.minutes::integer))
                             or exists(select 1 from public.booking_meetings other
                               join public.bookings ob on ob.id=other.booking_id
                               where ob.instructor_id=p_id and other.id<>m.id and other.status<>'cancelled'
                                 and (ob.status='confirmed' or (ob.status='awaiting_payment' and ob.created_at>=now()-interval '10 minutes'))
                                 and tstzrange(other.starts_at-make_interval(mins=>v_buffer),
                                   other.starts_at+make_interval(mins=>other.minutes+v_buffer),'[)')
                                   && tstzrange(m.starts_at,m.starts_at+make_interval(mins=>m.minutes),'[)'))))
            order by b.id
  loop
    raise exception 'A pending reservation conflicts with the updated schedule' using errcode = '55000';
  end loop;
  -- Ofertas ainda não aceitas que deixam de caber continuam na fila.
  for o in select f.id as offer_id, f.request_id, r.meetings
             from public.instructor_offers f join public.instructor_requests r on r.id = f.request_id
            where f.instructor_id = p_id and f.status = 'offered' and r.status = 'searching'
            for update of f, r skip locked
  loop
    if not public.instructor_can_attend(p_id, o.meetings) then
      update public.instructor_offers set status = 'declined', responded_at = now() where id = o.offer_id;
      perform public.write_audit('offer.withdrawn_availability', 'instructor_offer', o.offer_id::text, null, null);
      perform public.advance_instructor_offer(o.request_id);
      v_advanced := v_advanced + 1;
    end if;
  end loop;
  select count(*) into v_conflicts
    from public.booking_meetings m join public.bookings b on b.id = m.booking_id
   where b.instructor_id = p_id and b.status = 'confirmed' and m.status = 'scheduled' and m.starts_at > now()
     and not public.instructor_slot_open(p_id, m.starts_at, m.starts_at + make_interval(mins => m.minutes::integer));
  return jsonb_build_object('offers_advanced', v_advanced, 'holds_cancelled', 0, 'conflicting_meetings', v_conflicts);
end $$;
revoke all on function public.reconcile_instructor_availability(uuid) from public, anon, authenticated;

create function public.list_my_schedule_conflicts()
returns table (meeting_id uuid, booking_code text, starts_at timestamptz, minutes integer)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_role(array['instructor']::public.app_role[]);
begin
  return query
    select m.id, b.code, m.starts_at, m.minutes::integer
      from public.booking_meetings m join public.bookings b on b.id = m.booking_id
     where b.instructor_id = uid and b.status = 'confirmed' and m.status = 'scheduled' and m.starts_at > now()
       and not public.instructor_slot_open(uid, m.starts_at, m.starts_at + make_interval(mins => m.minutes))
     order by m.starts_at;
end $$;
revoke all on function public.list_my_schedule_conflicts() from public, anon;
grant execute on function public.list_my_schedule_conflicts() to authenticated;

-- 4. Escritas de agenda (todas travam a linha do instrutor primeiro) ----------------------------------------------------
create function public.save_my_weekly_schedule(p_days jsonb, p_buffer_minutes integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  d jsonb; br jsonb; v_wd integer; v_open time; v_close time; v_from time; v_to time; v_prev time;
  v_seen integer[] := '{}'; v_result jsonb;
begin
  perform 1 from public.instructors where id = uid for update;
  if not found then raise exception 'Instructor only' using errcode = '42501'; end if;
  if p_buffer_minutes is null or p_buffer_minutes not between 0 and 120
     or p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 7 then
    raise exception 'Invalid schedule' using errcode = '22023';
  end if;
  insert into public.instructor_schedule_settings (instructor_id, buffer_minutes) values (uid, p_buffer_minutes)
    on conflict (instructor_id) do update set buffer_minutes = excluded.buffer_minutes, updated_at = now();
  delete from public.instructor_weekly_breaks where instructor_id = uid;
  delete from public.instructor_weekly_hours where instructor_id = uid;
  for d in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(d) <> 'object' or (d - array['weekday', 'opens', 'closes', 'breaks']) <> '{}'::jsonb then
      raise exception 'Invalid schedule' using errcode = '22023';
    end if;
    v_wd := (d->>'weekday')::integer; v_open := (d->>'opens')::time; v_close := (d->>'closes')::time;
    if v_wd is null or v_wd not between 0 and 6 or v_wd = any (v_seen) or v_open is null or v_close is null or v_open >= v_close then
      raise exception 'Invalid schedule' using errcode = '22023';
    end if;
    v_seen := v_seen || v_wd;
    insert into public.instructor_weekly_hours (instructor_id, weekday, opens_at, closes_at) values (uid, v_wd, v_open, v_close);
    v_prev := v_open;
    if jsonb_typeof(coalesce(d->'breaks', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(d->'breaks', '[]'::jsonb)) > 3 then
      raise exception 'Invalid schedule' using errcode = '22023';
    end if;
    -- Pausas em ordem, dentro do turno e sem se tocar.
    for br in select value from jsonb_array_elements(coalesce(d->'breaks', '[]'::jsonb)) order by (value->>'from')::time loop
      v_from := (br->>'from')::time; v_to := (br->>'to')::time;
      if v_from is null or v_to is null or v_from >= v_to or v_from < v_prev or v_to > v_close then
        raise exception 'Invalid break' using errcode = '22023';
      end if;
      insert into public.instructor_weekly_breaks (instructor_id, weekday, starts_at, ends_at) values (uid, v_wd, v_from, v_to);
      v_prev := v_to;
    end loop;
  end loop;
  v_result := public.reconcile_instructor_availability(uid);
  perform public.write_audit('instructor.schedule_saved', 'instructor', uid::text, null,
    jsonb_build_object('days', p_days, 'buffer', p_buffer_minutes) || v_result);
  return v_result;
end $$;
revoke all on function public.save_my_weekly_schedule(jsonb, integer) from public, anon;
grant execute on function public.save_my_weekly_schedule(jsonb, integer) to authenticated;

-- Versão antiga (mesmo turno em vários dias): mesma assinatura, agora com lock, limpeza de pausas e reconciliação.
create or replace function public.save_my_schedule(p_days integer[], p_opens_at time, p_closes_at time, p_buffer_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_role(array['instructor']::public.app_role[]);
begin
  perform 1 from public.instructors where id = uid for update;
  if not found then raise exception 'Instructor only' using errcode = '42501'; end if;
  if p_days is null or cardinality(p_days) > 7
    or exists (select 1 from unnest(p_days) d where d is null or d not between 0 and 6)
    or p_opens_at is null or p_closes_at is null or p_opens_at >= p_closes_at
    or p_buffer_minutes is null or p_buffer_minutes not between 0 and 120
  then raise exception 'Invalid schedule' using errcode = '22023'; end if;
  insert into public.instructor_schedule_settings (instructor_id, buffer_minutes) values (uid, p_buffer_minutes)
    on conflict (instructor_id) do update set buffer_minutes = excluded.buffer_minutes, updated_at = now();
  delete from public.instructor_weekly_breaks where instructor_id = uid;
  delete from public.instructor_weekly_hours where instructor_id = uid;
  insert into public.instructor_weekly_hours (instructor_id, weekday, opens_at, closes_at)
    select uid, d, p_opens_at, p_closes_at from (select distinct unnest(p_days) as d) days;
  perform public.reconcile_instructor_availability(uid);
  perform public.write_audit('instructor.schedule_saved', 'instructor', uid::text, null,
    jsonb_build_object('days', p_days, 'opens', p_opens_at, 'closes', p_closes_at, 'buffer', p_buffer_minutes));
end $$;

create function public.add_my_time_off(p_start timestamptz, p_end timestamptz, p_kind text, p_reason text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_role(array['instructor']::public.app_role[]);
  v_id uuid; v_today_start timestamptz := (date_trunc('day', now() at time zone 'America/Fortaleza')) at time zone 'America/Fortaleza';
  v_max interval; v_min_start timestamptz; v_result jsonb;
begin
  perform 1 from public.instructors where id = uid for update;
  if not found then raise exception 'Instructor only' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('block', 'day_off', 'vacation') or p_start is null or p_end is null or p_end <= p_start
     or length(coalesce(p_reason, '')) > 160 then
    raise exception 'Invalid block' using errcode = '22023';
  end if;
  -- Folga e férias são DIAS INTEIROS locais: começam e terminam exatamente à meia-noite de Fortaleza (imposto aqui, não só na Server Action).
  if p_kind in ('day_off', 'vacation')
     and ((p_start at time zone 'America/Fortaleza')::time <> time '00:00' or (p_end at time zone 'America/Fortaleza')::time <> time '00:00') then
    raise exception 'Invalid block' using errcode = '22023';
  end if;
  v_max := case p_kind when 'block' then interval '30 days' when 'day_off' then interval '14 days' else interval '180 days' end;
  if p_end - p_start > v_max then raise exception 'Invalid block' using errcode = '22023'; end if;
  -- Bloqueio avulso precisa começar no futuro; folga e férias (dias inteiros locais) podem começar hoje.
  v_min_start := case when p_kind = 'block' then now() else v_today_start end;
  if p_start < v_min_start or p_end <= now() then
    raise exception 'Invalid block' using errcode = '22023';
  end if;
  if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
              where b.instructor_id = uid and b.status = 'confirmed' and m.status <> 'cancelled'
                and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(p_start, p_end, '[)')) then
    raise exception 'A confirmed class overlaps this block' using errcode = '55000';
  end if;
  if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
              where b.instructor_id = uid and b.status = 'awaiting_payment' and b.created_at >= now() - interval '10 minutes'
                and m.status <> 'cancelled'
                and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.minutes), '[)') && tstzrange(p_start, p_end, '[)')) then
    raise exception 'A pending reservation overlaps this block' using errcode = '55000';
  end if;
  insert into public.instructor_time_off (instructor_id, starts_at, ends_at, reason, kind)
    values (uid, p_start, p_end, coalesce(p_reason, ''), p_kind) returning id into v_id;
  v_result := public.reconcile_instructor_availability(uid);
  perform public.write_audit('instructor.time_blocked', 'time_off', v_id::text, null,
    jsonb_build_object('start', p_start, 'end', p_end, 'kind', p_kind) || v_result, p_reason);
  return v_id;
end $$;
revoke all on function public.add_my_time_off(timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.add_my_time_off(timestamptz, timestamptz, text, text) to authenticated;

-- block_my_time (3 args): mesma assinatura, agora com lock, recusa também reservas em pagamento e reconcilia.
create or replace function public.block_my_time(p_start timestamptz, p_end timestamptz, p_reason text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.add_my_time_off(p_start, p_end, 'block', p_reason);
end $$;

create function public.add_my_extra_hours(p_day date, p_opens time, p_closes time) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_role(array['instructor']::public.app_role[]); v_id uuid; v_result jsonb;
begin
  perform 1 from public.instructors where id = uid for update;
  if not found then raise exception 'Instructor only' using errcode = '42501'; end if;
  if p_day is null or p_opens is null or p_closes is null or p_opens >= p_closes
     or p_day < (now() at time zone 'America/Fortaleza')::date
     or p_day > (now() at time zone 'America/Fortaleza')::date + 180 then
    raise exception 'Invalid extra hours' using errcode = '22023';
  end if;
  if not exists (select 1 from public.instructor_schedule_settings where instructor_id = uid) then
    raise exception 'Configure your weekly schedule first' using errcode = '55000';
  end if;
  insert into public.instructor_extra_hours (instructor_id, day, opens_at, closes_at) values (uid, p_day, p_opens, p_closes)
    on conflict (instructor_id, day) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at
    returning id into v_id;
  -- Reduzir uma janela existente pode invalidar ofertas e reservas em pagamento: reconcilia sempre.
  v_result := public.reconcile_instructor_availability(uid);
  perform public.write_audit('instructor.extra_hours_saved', 'extra_hours', v_id::text, null,
    jsonb_build_object('day', p_day, 'opens', p_opens, 'closes', p_closes) || v_result);
  return jsonb_build_object('id', v_id) || v_result;
end $$;
revoke all on function public.add_my_extra_hours(date, time, time) from public, anon;
grant execute on function public.add_my_extra_hours(date, time, time) to authenticated;

create function public.remove_my_extra_hours(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_role(array['instructor']::public.app_role[]);
begin
  perform 1 from public.instructors where id = uid for update;
  delete from public.instructor_extra_hours where id = p_id and instructor_id = uid;
  if not found then raise exception 'Extra hours not found' using errcode = 'P0002'; end if;
  perform public.write_audit('instructor.extra_hours_removed', 'extra_hours', p_id::text, null, null);
  return public.reconcile_instructor_availability(uid);
end $$;
revoke all on function public.remove_my_extra_hours(uuid) from public, anon;
grant execute on function public.remove_my_extra_hours(uuid) to authenticated;

-- unblock_my_time: mesma assinatura, agora serializada e reconciliada (liberar horário nunca piora a agenda; mantém a trilha).
create or replace function public.unblock_my_time(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_role(array['instructor']::public.app_role[]);
begin
  perform 1 from public.instructors where id = uid for update;
  delete from public.instructor_time_off where id = p_id and instructor_id = uid;
  if not found then raise exception 'Block not found' using errcode = 'P0002'; end if;
  perform public.write_audit('instructor.time_unblocked', 'time_off', p_id::text, null, null);
end $$;

-- 5. Barreira no banco: dois encontros ativos do mesmo instrutor não se sobrepõem -----------------------------------------
create function public.assert_instructor_slot_free(p_instructor uuid, p_meeting uuid, p_starts timestamptz, p_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('instructor-meetings:' || p_instructor::text, 0));
  if exists (select 1 from public.booking_meetings m join public.bookings b on b.id = m.booking_id
              where b.instructor_id = p_instructor and m.id <> p_meeting and m.status::text <> 'cancelled'
                and (b.status::text = 'confirmed' or (b.status::text = 'awaiting_payment' and b.created_at >= pg_catalog.now() - interval '10 minutes'))
                and pg_catalog.tstzrange(m.starts_at, m.starts_at + pg_catalog.make_interval(mins => m.minutes), '[)')
                    && pg_catalog.tstzrange(p_starts, p_starts + pg_catalog.make_interval(mins => p_minutes), '[)')) then
    raise exception 'Instructor already has a meeting in this time slot' using errcode = '23P01', hint = 'INSTRUCTOR_MEETING_CONFLICT';
  end if;
end $$;
revoke all on function public.assert_instructor_slot_free(uuid, uuid, timestamptz, integer) from public, anon, authenticated;

create function public.guard_instructor_meeting_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_instructor uuid; v_status text; v_created timestamptz;
begin
  select b.instructor_id, b.status::text, b.created_at into v_instructor, v_status, v_created
    from public.bookings b where b.id = new.booking_id;
  if v_instructor is null or new.status::text = 'cancelled' or v_status not in ('confirmed', 'awaiting_payment')
     or (v_status = 'awaiting_payment' and v_created < pg_catalog.now() - interval '10 minutes') then
    return new;
  end if;
  perform public.assert_instructor_slot_free(v_instructor, new.id, new.starts_at, new.minutes);
  return new;
end $$;
revoke all on function public.guard_instructor_meeting_overlap() from public, anon, authenticated;
create trigger guard_instructor_meeting_overlap_insert_update
after insert or update of starts_at, minutes, status, booking_id on public.booking_meetings
for each row execute function public.guard_instructor_meeting_overlap();

-- Ativação (awaiting_payment -> confirmed) e troca de instrutor revalidam todos os encontros ativos da reserva.
create function public.guard_instructor_booking_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if new.instructor_id is not null and new.status::text in ('confirmed', 'awaiting_payment')
     and ((new.status::text = 'confirmed' and old.status::text <> 'confirmed') or new.instructor_id is distinct from old.instructor_id) then
    for m in select id, starts_at, minutes from public.booking_meetings where booking_id = new.id and status::text <> 'cancelled' loop
      perform public.assert_instructor_slot_free(new.instructor_id, m.id, m.starts_at, m.minutes);
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.guard_instructor_booking_change() from public, anon, authenticated;
create trigger guard_instructor_booking_change_update
after update of status, instructor_id on public.bookings
for each row execute function public.guard_instructor_booking_change();

commit;
