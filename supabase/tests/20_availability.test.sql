-- Tests for saved instructor schedules, ownership and time-off rules.
-- Runs after 10_rules.test.sql in the same throwaway DATABASE.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',uid,false);
  execute 'set role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',false);
end $$;

-- Validate a saved schedule and a temporary absence at a future date in Preá.
do $$
declare
  v_start timestamptz;
  v_dow integer;
  v_open jsonb;
  v_early jsonb;
  v_block uuid;
begin
  v_start := (((now() at time zone 'America/Fortaleza')::date + 32)::timestamp
              + interval '10 hours') at time zone 'America/Fortaleza';
  v_dow := extract(dow from (v_start at time zone 'America/Fortaleza'))::integer;
  v_open := jsonb_build_array(jsonb_build_object('starts_at',v_start,'hours',2));
  v_early := jsonb_build_array(jsonb_build_object('starts_at',v_start-interval '3 hours','hours',2));

  assert public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',v_open),
    'legacy schedule is available before instructor configures it';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  perform public.save_my_schedule(array[v_dow],time '08:00',time '17:00',30);
  perform pg_temp.reset();
  assert public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',v_open),
    'saved time window must be available';
  assert not public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',v_early),
    'before shift must be unavailable';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  v_block := public.block_my_time(v_start,v_start+interval '2 hours','Descanso');
  perform pg_temp.reset();
  assert not public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',v_open),
    'blocked time must be unavailable';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  begin
    perform public.unblock_my_time(v_block);
    raise exception 'other instructor removed time block';
  exception when no_data_found then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  perform public.unblock_my_time(v_block);
  perform pg_temp.reset();
  assert public.instructor_can_attend('00000000-0000-0000-0000-0000000000a1',v_open),
    'unblocked time must be available again';

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
  begin
    perform public.save_my_schedule(array[v_dow],time '08:00',time '17:00',30);
    raise exception 'student saved instructor schedule';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  -- Overlapping meetings in a single request must be rejected before insertion.
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
  begin
    perform public.create_booking((select id from public.beaches where slug='jeri'),
      'first_time','Português',jsonb_build_array(
        jsonb_build_object('starts_at',v_start,'hours',2),
        jsonb_build_object('starts_at',v_start+interval '1 hour','hours',1)));
    raise exception 'overlapping meetings were accepted';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.reset();
end $$;
