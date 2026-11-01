-- Phase 9: private instructor documentation and audited admin review.
begin;
create table public.instructor_documents (
 id uuid primary key default gen_random_uuid(),
 instructor_id uuid not null references public.instructors(id) on delete cascade,
 kind text not null check(kind in ('identity','certification','insurance','other')),
 storage_path text not null unique,
 original_name text not null check(length(original_name) between 1 and 180),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_notes text,
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 uploaded_at timestamptz not null default now()
);
create index instructor_documents_idx on public.instructor_documents(instructor_id,uploaded_at desc);
alter table public.instructor_documents enable row level security;
revoke all on public.instructor_documents from public,anon,authenticated;
grant select on public.instructor_documents to authenticated;
create policy documents_private_read on public.instructor_documents for select to authenticated
 using(instructor_id=auth.uid() or public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vento-instructor-documents','vento-instructor-documents',false,8388608,
  array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
drop policy if exists vento_documents_read on storage.objects;
create policy vento_documents_read on storage.objects for select to authenticated using(
 bucket_id='vento-instructor-documents' and
 ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin())
);
drop policy if exists vento_documents_insert on storage.objects;
create policy vento_documents_insert on storage.objects for insert to authenticated with check(
 bucket_id='vento-instructor-documents' and
 (storage.foldername(name))[1]=(select auth.uid())::text
);

create function public.register_my_document(
 p_kind text,p_path text,p_original_name text
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]); rid uuid;
begin
 if p_kind not in ('identity','certification','insurance','other') or p_kind is null
    or p_path is null or p_path !~ ('^'||uid::text||'/[a-f0-9-]{36}\.(jpg|png|pdf)$')
    or p_original_name is null or length(p_original_name) not between 1 and 180 then
   raise exception 'Invalid document metadata' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects o
   where o.bucket_id='vento-instructor-documents' and o.name=p_path) then
   raise exception 'Document upload not found' using errcode='P0002'; end if;
 insert into public.instructor_documents(instructor_id,kind,storage_path,original_name)
 values(uid,p_kind,p_path,p_original_name) returning id into rid;
 perform public.write_audit('document.uploaded','instructor_document',rid::text,null,
   jsonb_build_object('kind',p_kind,'instructor',uid));
 return rid;
end $$;

create function public.review_instructor_document(
 p_document_id uuid,p_status text,p_notes text
) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['admin']::public.app_role[]);
  original public.instructor_documents;
begin
 if p_status not in ('approved','rejected') or p_status is null
    or length(coalesce(p_notes,''))>1000
    or (p_status='rejected' and length(btrim(coalesce(p_notes,'')))<5) then
   raise exception 'Invalid document decision' using errcode='22023'; end if;
 select * into original from public.instructor_documents where id=p_document_id for update;
 if original.id is null then raise exception 'Document not found' using errcode='P0002'; end if;
 update public.instructor_documents
 set status=p_status,review_notes=nullif(btrim(coalesce(p_notes,'')),''),
   reviewed_by=uid,reviewed_at=now()
 where id=original.id;
 perform public.write_audit('document.reviewed','instructor_document',p_document_id::text,
   jsonb_build_object('status',original.status),jsonb_build_object('status',p_status),p_notes);
end $$;

revoke execute on function public.register_my_document(text,text,text) from public,anon;
revoke execute on function public.review_instructor_document(uuid,text,text) from public,anon;
grant execute on function public.register_my_document(text,text,text) to authenticated;
grant execute on function public.review_instructor_document(uuid,text,text) to authenticated;
commit;
