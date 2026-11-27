-- Disposable PostgreSQL only. Claims/roles and push endpoints are synthetic.
\set ON_ERROR_STOP on
begin;
insert into auth.sessions(id,user_id) values
 ('96111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-0000000000b1'),
 ('96222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-0000000000b2');
do $$
declare
 actor text; sig text; sub uuid; notice uuid; j jsonb; target jsonb; result text;
 cutoff timestamptz:=now()-interval '1 second'; old_lease uuid; old_job uuid; i integer;
 pk text:=rtrim(translate(replace(encode(decode('04'||repeat('00',64),'hex'),'base64'),E'\n',''),'+/','-_'),'=');
 ak text:=rtrim(translate(encode(decode(repeat('00',16),'hex'),'base64'),'+/','-_'),'=');
begin
 assert not(select enabled from public.push_dispatch_settings where singleton),'dispatch defaults OFF';
 foreach sig in array array['public.preview_push_dispatch(timestamptz)','public.claim_push_dispatch(timestamptz)',
   'public.prepare_push_dispatch(uuid,uuid,timestamptz)','public.settle_push_dispatch(uuid,uuid,text,integer,integer)']
 loop
   assert has_function_privilege('vento_push_dispatcher',sig,'EXECUTE'),'worker RPC allowed';
   assert not has_function_privilege('anon',sig,'EXECUTE'),'anon RPC denied';
   assert not has_function_privilege('authenticated',sig,'EXECUTE'),'client RPC denied';
   assert not exists(select 1 from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where p.oid=sig::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC RPC denied';
 end loop;
 assert not has_function_privilege('vento_push_dispatcher','public.push_dispatch_target(uuid)','EXECUTE'),'target helper internal';
 assert not has_table_privilege('vento_push_dispatcher','public.push_outbox','SELECT'),'worker cannot read table directly';
 assert(select relrowsecurity from pg_class where oid='public.push_outbox'::regclass),'outbox RLS enabled';
 assert(select relrowsecurity from pg_class where oid='public.push_dispatch_settings'::regclass),'settings RLS enabled';
 foreach actor in array array['anon','authenticated'] loop
   execute format('set local role %I',actor);
   begin perform public.claim_push_dispatch(cutoff);raise exception 'untrusted claim accepted';
   exception when insufficient_privilege then null;end;
   execute 'reset role';
 end loop;
 insert into public.push_subscriptions(owner_id,session_id,endpoint,p256dh,auth_secret,updated_at)
 values('00000000-0000-0000-0000-0000000000b1','96111111-1111-4111-8111-111111111111',
 'https://fcm.googleapis.com/fcm/send/outbox-synthetic',pk,ak,now()-interval '1 minute') returning id into sub;
 insert into public.app_notifications(recipient_id,category,title,body,href)values
 ('00000000-0000-0000-0000-0000000000b1','message','PRIVATE NAME','PRIVATE CHAT','/aluno/atendimento/private');
 assert(select count(*) from public.push_outbox)=0,'OFF does not enqueue';
 update public.push_dispatch_settings set enabled=true,activated_at=cutoff where singleton;
 insert into public.app_notifications(recipient_id,category,title,href) values
 ('00000000-0000-0000-0000-0000000000b1','message','no consent','/aluno/avisos');
 assert(select count(*) from public.push_outbox)=0,'subscription gate also required';
 update public.push_subscription_settings set enabled=true;
 insert into public.app_notifications(recipient_id,category,title,href,created_at) values
 ('00000000-0000-0000-0000-0000000000b1','message','legacy','/aluno/avisos',now()-interval '1 day');
 assert(select count(*) from public.push_outbox)=0,'no historic backfill';
 insert into public.app_notifications(recipient_id,category,title,body,href)values
 ('00000000-0000-0000-0000-0000000000b1','message','PRIVATE NAME','PRIVATE CHAT','/aluno/reserva/private')
 returning id into notice;
 assert(select count(*) from public.push_outbox)=1,'only consented owner enqueued';
 begin
   insert into public.push_outbox(notification_id,subscription_id,recipient_id,expires_at)
     values(notice,sub,'00000000-0000-0000-0000-0000000000b1',now()+interval '15 minutes');
   raise exception 'duplicate outbox accepted';
 exception when unique_violation then null;end;
 execute 'set local role vento_push_dispatcher';
 assert(public.preview_push_dispatch(cutoff)->>'pending')::integer=1,'preview counts only';
 begin perform public.claim_push_dispatch(cutoff-interval '1 second');raise exception 'wrong cutoff accepted';
 exception when sqlstate '55000' then null;end;
 j:=public.claim_push_dispatch(cutoff);
 assert j is not null,'first worker claims';
 assert public.claim_push_dispatch(cutoff) is null,'second worker cannot claim same lease';
 begin perform public.prepare_push_dispatch((j->>'id')::uuid,gen_random_uuid(),cutoff);raise exception 'stale lease accepted';
 exception when sqlstate '55000' then null;end;
 target:=public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);
 assert target->>'href'='/aluno/avisos','private/external href is replaced by generic owner inbox';
 assert not(target?'body') and not(target?'title') and not(target?'recipientId'),'private content absent';
 assert target->>'notificationId'=notice::text,'notice identity stable';
 begin perform public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);raise exception 'prepare replay accepted';
 exception when sqlstate '55000' then null;end;
 result:=public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'retry',429,60);
 assert result='pending','known rate limit retries';
 execute 'reset role';
 assert(select attempts from public.push_outbox where id=(j->>'id')::uuid)=1,'attempt counted once';
 assert(select next_attempt_at>=now()+interval '60 seconds' from public.push_outbox where id=(j->>'id')::uuid),'Retry-After honored';
 update public.push_outbox set next_attempt_at=now() where id=(j->>'id')::uuid;
 execute 'set local role vento_push_dispatcher';
 old_lease:=(j->>'leaseToken')::uuid;
 j:=public.claim_push_dispatch(cutoff);
 assert(j->>'leaseToken')::uuid<>old_lease,'new fencing token on retry';
 begin perform public.prepare_push_dispatch((j->>'id')::uuid,old_lease,cutoff);raise exception 'old fencing token accepted';
 exception when sqlstate '55000' then null;end;
 target:=public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);
 assert public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'accepted',201,0)='accepted','provider acceptance recorded';
 begin perform public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'accepted',201,0);raise exception 'settle replay accepted';
 exception when sqlstate '55000' then null;end;
 assert public.claim_push_dispatch(cutoff) is null,'accepted notice never resent';
 execute 'reset role';
 -- Re-read notification before prepare: no attempt or keys after it is read.
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b1','booking','read race','/aluno/avisos')returning id into notice;
 execute 'set local role vento_push_dispatcher';j:=public.claim_push_dispatch(cutoff);execute 'reset role';
 update public.app_notifications set read_at=now() where id=notice;
 execute 'set local role vento_push_dispatcher';
 assert public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff) is null,'read after claim cancels before exposure';
 execute 'reset role';
 -- Unprepared lease is recoverable; prepared lease with unknown outcome is terminal.
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b1','booking','lease recovery','/aluno/avisos');
 execute 'set local role vento_push_dispatcher';j:=public.claim_push_dispatch(cutoff);execute 'reset role';
 old_job:=(j->>'id')::uuid;
 update public.push_outbox set lease_until=now()-interval '1 second' where id=old_job;
 update public.push_dispatch_recipient_rates set rate_window=now()-interval '2 minutes';
 execute 'set local role vento_push_dispatcher';
 j:=public.claim_push_dispatch(cutoff);assert(j->>'id')::uuid=old_job,'unprepared lease recovered';
 target:=public.prepare_push_dispatch(old_job,(j->>'leaseToken')::uuid,cutoff);
 execute 'reset role';
 update public.push_outbox set lease_until=now()-interval '1 second' where id=old_job;
 execute 'set local role vento_push_dispatcher';perform public.claim_push_dispatch(cutoff);execute 'reset role';
 assert(select status from public.push_outbox where id=old_job)='unknown','ambiguous prepared lease is never replayed';
 -- 410 erases keys only for the version used by this attempt.
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b1','booking','gone','/aluno/avisos');
 execute 'set local role vento_push_dispatcher';j:=public.claim_push_dispatch(cutoff);
 target:=public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);
 assert public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'gone',410,0)='dead','gone is terminal';
 execute 'reset role';
 assert(select revoked_at is not null and p256dh is null and auth_secret is null from public.push_subscriptions where id=sub),'410 removes secrets';
 -- Global and per-recipient rate limits are shared across workers.
 update public.push_subscriptions set revoked_at=null,p256dh=pk,auth_secret=ak,updated_at=now()-interval '1 minute' where id=sub;
 update public.push_dispatch_recipient_rates set rate_window=now()-interval '2 minutes';
 update public.push_dispatch_settings set rate_claims=100,rate_window=now() where singleton;
 for i in 1..6 loop
   insert into public.app_notifications(recipient_id,category,title,href)values
   ('00000000-0000-0000-0000-0000000000b1','booking','rate fixture','/aluno/avisos');
 end loop;
 execute 'set local role vento_push_dispatcher';assert public.claim_push_dispatch(cutoff) is null,'global rate budget';execute 'reset role';
 update public.push_dispatch_settings set rate_claims=0 where singleton;
 for i in 1..5 loop
   execute 'set local role vento_push_dispatcher';j:=public.claim_push_dispatch(cutoff);
   assert j is not null,'recipient budget has five slots';
   target:=public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);
   perform public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'accepted',201,0);
   execute 'reset role';
 end loop;
 execute 'set local role vento_push_dispatcher';assert public.claim_push_dispatch(cutoff) is null,'sixth recipient claim limited';execute 'reset role';
 assert(select count(*) from public.push_outbox where status='pending')=1,'limited job preserved';
end $$;

do $$
declare sub uuid; notice uuid;j jsonb;target jsonb;cutoff timestamptz:=now()-interval '1 second';i integer;result text;
begin
 select id into strict sub from public.push_subscriptions where endpoint='https://fcm.googleapis.com/fcm/send/outbox-synthetic';
 update public.push_outbox set status='dead' where status='pending';
 update public.push_dispatch_recipient_rates set rate_window=now()-interval '2 minutes';
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b2','message','other account','/aluno/avisos');
 assert not exists(select 1 from public.push_outbox where recipient_id='00000000-0000-0000-0000-0000000000b2'),'no cross-account target';
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b1','booking','five attempts','/aluno/avisos')returning id into notice;
 for i in 1..5 loop
   execute 'set local role vento_push_dispatcher';
   j:=public.claim_push_dispatch(cutoff);assert j is not null,'retry claim';
   target:=public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);
   result:=public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'retry',503,0);
   execute 'reset role';
   if i<5 then
     assert result='pending','transient retry before cap';
     assert(select next_attempt_at=now()+make_interval(secs=>30*power(2,i-1)::integer)
       from public.push_outbox where id=(j->>'id')::uuid),'exponential backoff';
     update public.push_outbox set next_attempt_at=now() where id=(j->>'id')::uuid;
   else assert result='dead','fifth attempt is terminal';end if;
 end loop;
 assert(select attempts from public.push_outbox where notification_id=notice)=5,'attempt cap exact';
 update public.push_dispatch_recipient_rates set rate_window=now()-interval '2 minutes';
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b1','booking','renewal race','/aluno/avisos');
 execute 'set local role vento_push_dispatcher';j:=public.claim_push_dispatch(cutoff);
 target:=public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);execute 'reset role';
 update public.push_subscriptions set updated_at=now() where id=sub;
 execute 'set local role vento_push_dispatcher';
 perform public.settle_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,'gone',404,0);execute 'reset role';
 assert(select revoked_at is null and p256dh is not null from public.push_subscriptions where id=sub),'old 404 cannot revoke renewed keys';
 update public.push_subscriptions set updated_at=now()-interval '1 minute' where id=sub;
 insert into public.app_notifications(recipient_id,category,title,href)values
 ('00000000-0000-0000-0000-0000000000b1','booking','gate race','/aluno/avisos');
 execute 'set local role vento_push_dispatcher';j:=public.claim_push_dispatch(cutoff);execute 'reset role';
 update public.push_dispatch_settings set enabled=false where singleton;
 execute 'set local role vento_push_dispatcher';
 begin perform public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff);raise exception 'gate OFF after claim exposed keys';
 exception when sqlstate '55000' then null;end;execute 'reset role';
 update public.push_dispatch_settings set enabled=true where singleton;
 update public.push_subscriptions set revoked_at=now(),p256dh=null,auth_secret=null where id=sub;
 execute 'set local role vento_push_dispatcher';
 assert public.prepare_push_dispatch((j->>'id')::uuid,(j->>'leaseToken')::uuid,cutoff) is null,'revoked subscription cannot prepare';
 execute 'reset role';
end $$;

rollback;
select 'PASS: push outbox OFF/owner/dedup/fencing/replay/retry/410/ambiguity/rate limits in disposable PostgreSQL' as result;
