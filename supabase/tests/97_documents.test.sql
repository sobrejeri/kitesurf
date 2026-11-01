-- Private instructor documents and mandatory first approval requirements.
\set ON_ERROR_STOP on
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',uid,false); execute 'set role authenticated'; end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub','',false); end $$;

do $$
declare doc_id uuid; path text;
begin
  path:='00000000-0000-0000-0000-0000000000a1/'||gen_random_uuid()::text||'.pdf';
  insert into storage.objects(bucket_id,name)
    values('vento-instructor-documents',path);
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
  doc_id:=public.register_my_document('certification',path,'Certificado.pdf');
  assert (select status from public.instructor_documents where id=doc_id)='pending',
    'new evidence is pending review';
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
  assert (select count(*) from public.instructor_documents where id=doc_id)=0,
    'another instructor cannot read private documents';
  begin
    perform public.review_instructor_document(doc_id,'approved','');
    raise exception 'instructor approved own colleague certificate';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset();

  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  perform public.review_instructor_document(doc_id,'approved','Documento conferido');
  perform pg_temp.reset();
  assert (select status from public.instructor_documents where id=doc_id)='approved',
    'admin review persists';

  -- New teachers cannot be activated without TWO reviewed document categories.
  insert into auth.users(id,email,raw_user_meta_data)
    values('00000000-0000-0000-0000-0000000000a3','novo@test',
      '{"role":"instructor","full_name":"Instrutor Novo"}'::jsonb);
  assert exists(select 1 from public.instructors
    where id='00000000-0000-0000-0000-0000000000a3'),'fixture created new instructor';
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  begin
    perform public.set_instructor_status('00000000-0000-0000-0000-0000000000a3',
      'approved','Documentos ainda não verificados');
    raise exception 'new teacher approved without documents';
  exception when sqlstate '55000' then null; end;
  perform pg_temp.reset();
end $$;
