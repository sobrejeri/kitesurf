-- Phase 10: require verified identity and certification for new instructor approval.
-- Existing active instructors remain approved, prior approval can resume.
begin;
create or replace function public.set_instructor_status(p_instructor_id uuid, p_status public.instructor_status, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.instructors;
begin
  perform public.require_role(array['admin']::public.app_role[]);
  select * into i from public.instructors where id = p_instructor_id for update;
  if i.id is null then
    raise exception 'Instructor not found' using errcode = 'P0002';
  end if;

  -- First-time activation requires administrator-reviewed identity and
  -- professional qualification. Resume an already-approved teacher normally.
  if p_status = 'approved' and i.approved_at is null then
    if not exists(select 1 from public.instructor_documents d
      where d.instructor_id=i.id and d.kind='identity' and d.status='approved')
      or not exists(select 1 from public.instructor_documents d
      where d.instructor_id=i.id and d.kind='certification' and d.status='approved')
    then raise exception 'Instructor documents must be approved before activation'
      using errcode='55000'; end if;
  end if;
  update public.instructors set
    status = p_status,
    approved_at = coalesce(approved_at, case when p_status = 'approved' then now() end),
    -- First approval takes a place at the end; pausing and resuming keep it.
    queue_position = coalesce(queue_position,
      case when p_status = 'approved' then nextval('public.instructor_queue_seq') end)
  where id = i.id;

  perform public.write_audit('instructor.status_changed', 'instructor', i.id::text,
    jsonb_build_object('status', i.status), jsonb_build_object('status', p_status), p_reason);
end;
$$;
commit;
