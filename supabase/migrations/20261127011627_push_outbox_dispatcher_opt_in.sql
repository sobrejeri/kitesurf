-- Prepared only: no activation, backfill, scheduler or network calls.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='vento_push_dispatcher') then
    create role vento_push_dispatcher nologin noinherit nobypassrls;
  end if;
end $$;
grant usage on schema public to vento_push_dispatcher;

create table public.push_dispatch_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  activated_at timestamptz,
  rate_window timestamptz not null default now(),
  rate_claims integer not null default 0 check(rate_claims between 0 and 100),
  check(not enabled or (activated_at is not null and isfinite(activated_at)))
);
insert into public.push_dispatch_settings(singleton) values(true);
alter table public.push_dispatch_settings enable row level security;
revoke all on public.push_dispatch_settings from public,anon,authenticated,vento_push_dispatcher;


create table public.push_dispatch_recipient_rates (
  recipient_id uuid primary key references public.profiles(id) on delete cascade,
  rate_window timestamptz not null default now(),
  rate_claims integer not null default 0 check(rate_claims between 0 and 5)
);
alter table public.push_dispatch_recipient_rates enable row level security;
revoke all on public.push_dispatch_recipient_rates from public,anon,authenticated,vento_push_dispatcher;

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','leased','accepted','dead','unknown')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lease_token uuid,
  lease_until timestamptz,
  claimed_at timestamptz,
  attempt_started boolean not null default false,
  target_updated_at timestamptz,
  accepted_at timestamptz,
  last_http_status integer,
  created_at timestamptz not null default now(),
  unique(notification_id,subscription_id),
  check((status='leased' and lease_token is not null and lease_until is not null)
    or (status<>'leased' and lease_token is null and lease_until is null))
);
create index push_outbox_due on public.push_outbox(next_attempt_at,id) where status='pending';
create index push_outbox_recipient_rate on public.push_outbox(recipient_id,claimed_at);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public,anon,authenticated,vento_push_dispatcher;

create function public.enqueue_push_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz;
begin
  select d.activated_at into cutoff from public.push_dispatch_settings d
    where d.singleton and d.enabled and d.activated_at<=now()
      and exists(select 1 from public.push_subscription_settings s where s.singleton and s.enabled);
  if cutoff is null or new.created_at<cutoff or new.read_at is not null then return new; end if;
  insert into public.push_outbox(notification_id,subscription_id,recipient_id,expires_at)
    select new.id,s.id,new.recipient_id,new.created_at+
      case when new.category='offer' then interval '2 minutes' else interval '15 minutes' end
    from public.push_subscriptions s join auth.sessions a on a.id=s.session_id and a.user_id=s.owner_id
    where s.owner_id=new.recipient_id and s.revoked_at is null
      and s.updated_at<=new.created_at
      and (s.expiration_time is null or s.expiration_time>now())
      and coalesce((to_jsonb(a)->>'not_after')::timestamptz>now(),true)
    on conflict(notification_id,subscription_id) do nothing;
  return new;
end $$;
revoke all on function public.enqueue_push_notice() from public,anon,authenticated,vento_push_dispatcher;
create trigger enqueue_push_notice after insert on public.app_notifications
  for each row execute function public.enqueue_push_notice();

-- Internal target helper. Never grant directly, even to the worker.
create function public.push_dispatch_target(p_id uuid)
returns table(notification_id uuid,endpoint text,p256dh text,auth_secret text,
  target_updated_at timestamptz,href text,ttl integer)
language sql stable security invoker set search_path='' as $$
  select n.id,s.endpoint,s.p256dh,s.auth_secret,s.updated_at,
    case p.role when 'student' then '/aluno/avisos' when 'instructor' then '/instrutor/avisos'
      when 'admin' then '/admin/avisos' when 'partner' then '/afiliado/inicio' end,
    greatest(1,least(900,floor(extract(epoch from(q.expires_at-now())))::integer))
  from public.push_outbox q
  join public.app_notifications n on n.id=q.notification_id and n.recipient_id=q.recipient_id
  join public.push_subscriptions s on s.id=q.subscription_id and s.owner_id=q.recipient_id
  join auth.sessions a on a.id=s.session_id and a.user_id=s.owner_id
  join public.profiles p on p.id=q.recipient_id
  where q.id=p_id and q.expires_at>now() and n.read_at is null
    and s.revoked_at is null and s.p256dh is not null and s.auth_secret is not null
    and (s.expiration_time is null or s.expiration_time>now())
    and s.updated_at<=n.created_at
    and coalesce((to_jsonb(a)->>'not_after')::timestamptz>now(),true);
$$;
revoke all on function public.push_dispatch_target(uuid) from public,anon,authenticated,vento_push_dispatcher;

create function public.preview_push_dispatch(p_activation timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'enabled',coalesce((select enabled and activated_at=p_activation and activated_at<=now()
      from public.push_dispatch_settings where singleton),false)
      and coalesce((select enabled from public.push_subscription_settings where singleton),false),
    'pending',(select count(*) from public.push_outbox where status='pending'),
    'unknown',(select count(*) from public.push_outbox where status='unknown'),
    'accepted',(select count(*) from public.push_outbox where status='accepted'));
$$;

create function public.claim_push_dispatch(p_activation timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.push_dispatch_settings; job public.push_outbox; token uuid;
begin
  select * into cfg from public.push_dispatch_settings where singleton for update;
  if cfg.singleton is null or not cfg.enabled or cfg.activated_at is distinct from p_activation or cfg.activated_at>now()
    or not coalesce((select enabled from public.push_subscription_settings where singleton),false) then
    raise exception 'Push dispatch disabled or activation mismatch' using errcode='55000';
  end if;
  -- One serialized budget across every worker and retry, not a per-process limit.
  if cfg.rate_window<=now()-interval '1 minute' then
    update public.push_dispatch_settings set rate_window=now(),rate_claims=0 where singleton;
    cfg.rate_claims:=0;
  end if;
  if cfg.rate_claims>=100 then return null; end if;
  update public.push_outbox set
    status=case when attempt_started then 'unknown' else 'pending' end,
    lease_token=null,lease_until=null
    where status='leased' and lease_until<=now();
  update public.push_outbox set status='dead'
    where status='pending' and (expires_at<=now() or attempts>=5);
  for job in select * from public.push_outbox
    where status='pending' and next_attempt_at<=now() and created_at>=cfg.activated_at
    order by next_attempt_at,id for update skip locked limit 100
  loop
    if not exists(select 1 from public.push_dispatch_target(job.id)) then
      update public.push_outbox set status='dead' where id=job.id;
      continue;
    end if;
    insert into public.push_dispatch_recipient_rates(recipient_id) values(job.recipient_id)
      on conflict(recipient_id) do update set
        rate_claims=case when public.push_dispatch_recipient_rates.rate_window<=now()-interval '1 minute'
          then 0 else public.push_dispatch_recipient_rates.rate_claims end,
        rate_window=case when public.push_dispatch_recipient_rates.rate_window<=now()-interval '1 minute'
          then now() else public.push_dispatch_recipient_rates.rate_window end;
    if (select rate_claims from public.push_dispatch_recipient_rates
      where recipient_id=job.recipient_id)>=5 then continue; end if;
    token:=gen_random_uuid();
    update public.push_outbox set status='leased',lease_token=token,
      lease_until=now()+interval '2 minutes',claimed_at=now(),attempt_started=false
      where id=job.id;
    update public.push_dispatch_settings set rate_claims=rate_claims+1 where singleton;
    update public.push_dispatch_recipient_rates set rate_claims=rate_claims+1 where recipient_id=job.recipient_id;
    return jsonb_build_object('id',job.id,'leaseToken',token);
  end loop;
  return null;
end $$;

create function public.prepare_push_dispatch(p_id uuid,p_lease uuid,p_activation timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.push_outbox; target record;
begin
  -- Same lock order as claim. OFF is rechecked immediately before exposing keys.
  perform 1 from public.push_dispatch_settings where singleton and enabled
    and activated_at=p_activation and activated_at<=now() for share;
  if not found or not coalesce((select enabled from public.push_subscription_settings where singleton),false) then
    raise exception 'Push dispatch disabled' using errcode='55000';
  end if;
  select * into job from public.push_outbox where id=p_id for update;
  if job.id is null or job.status<>'leased' or job.lease_token is distinct from p_lease
    or job.lease_until<=now() or job.attempt_started then
    raise exception 'Stale or replayed push lease' using errcode='55000';
  end if;
  select * into target from public.push_dispatch_target(job.id);
  if not found then
    update public.push_outbox set status='dead',lease_token=null,lease_until=null where id=job.id;
    return null;
  end if;
  perform public.validate_push_subscription_input(target.endpoint,target.p256dh,target.auth_secret);
  update public.push_outbox set attempts=attempts+1,attempt_started=true,
    target_updated_at=target.target_updated_at where id=job.id;
  return jsonb_build_object('id',job.id,'notificationId',target.notification_id,
    'subscription',jsonb_build_object('endpoint',target.endpoint,
      'keys',jsonb_build_object('p256dh',target.p256dh,'auth',target.auth_secret)),
    'href',target.href,'ttl',target.ttl);
end $$;

create function public.settle_push_dispatch(
  p_id uuid,p_lease uuid,p_outcome text,p_status integer,p_retry_after integer default 0
) returns text language plpgsql security definer set search_path='' as $$
declare job public.push_outbox; next_time timestamptz; final_status text;
begin
  if p_outcome is null or p_outcome not in ('accepted','retry','gone','dead','unknown')
    or p_retry_after is null or p_retry_after not between 0 and 3600
    or (p_outcome='accepted' and p_status is distinct from 201)
    or (p_outcome='retry' and (p_status is null or p_status not in (408,429,500,502,503,504)))
    or (p_outcome='gone' and (p_status is null or p_status not in (404,410))) then
    raise exception 'Invalid push outcome' using errcode='22023';
  end if;
  select * into job from public.push_outbox where id=p_id for update;
  if job.id is null or job.status<>'leased' or job.lease_token is distinct from p_lease
    or job.lease_until<=now() or not job.attempt_started then
    raise exception 'Stale or replayed push settlement' using errcode='55000';
  end if;
  final_status:=case p_outcome when 'accepted' then 'accepted' when 'unknown' then 'unknown' else 'dead' end;
  if p_outcome='retry' and job.attempts<5 then
    next_time:=now()+make_interval(secs=>greatest(p_retry_after,least(3600,30*power(2,job.attempts-1)::integer)));
    if next_time<job.expires_at then final_status:='pending'; end if;
  end if;
  if p_outcome='gone' then
    -- Do not revoke a renewed subscription due to an older in-flight response.
    update public.push_subscriptions set revoked_at=now(),p256dh=null,auth_secret=null,updated_at=now()
      where id=job.subscription_id and owner_id=job.recipient_id and updated_at=job.target_updated_at;
  end if;
  update public.push_outbox set status=final_status,
    next_attempt_at=coalesce(next_time,next_attempt_at),last_http_status=p_status,
    accepted_at=case when final_status='accepted' then now() else null end,
    lease_token=null,lease_until=null where id=job.id;
  return final_status;
end $$;

revoke all on function public.preview_push_dispatch(timestamptz) from public,anon,authenticated;
revoke all on function public.claim_push_dispatch(timestamptz) from public,anon,authenticated;
revoke all on function public.prepare_push_dispatch(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.settle_push_dispatch(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.preview_push_dispatch(timestamptz),
  public.claim_push_dispatch(timestamptz),public.prepare_push_dispatch(uuid,uuid,timestamptz),
  public.settle_push_dispatch(uuid,uuid,text,integer,integer) to vento_push_dispatcher;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on public.push_outbox,public.push_dispatch_settings,public.push_dispatch_recipient_rates from service_role;
    grant execute on function public.preview_push_dispatch(timestamptz),
      public.claim_push_dispatch(timestamptz),public.prepare_push_dispatch(uuid,uuid,timestamptz),
      public.settle_push_dispatch(uuid,uuid,text,integer,integer) to service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
