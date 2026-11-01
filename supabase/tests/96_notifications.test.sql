-- Notification RLS: only the addressed participant reads and acknowledges alerts.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare n uuid;
begin
  -- A paid booking and accepted instructor offer must have generated alerts.
  assert (select count(*) from public.app_notifications)>0,'triggers create notifications';
  insert into public.app_notifications(recipient_id,category,title,body,href)
    values('00000000-0000-0000-0000-0000000000b1','booking','Aviso de teste',
      'Aviso privado','/aluno/aulas') returning id into n;

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  assert (select count(*) from public.app_notifications where id=n)=0,
    'different student cannot see alerts';
  begin
    perform public.mark_my_notification_read(n);
    raise exception 'unrelated student marked alert as read';
  exception when no_data_found then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  assert (select count(*) from public.app_notifications where id=n)=1,'recipient can read';
  perform public.mark_my_notification_read(n);
  assert (select read_at from public.app_notifications where id=n) is not null,
    'recipient can acknowledge alert';
  perform pg_temp.reset();
end $$;
