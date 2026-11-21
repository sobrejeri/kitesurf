-- P0 #92/#90: aceitar uma oferta cujo aluno ja tem encontro sobreposto nao pode lancar erro cru nem deixar a oferta presa.
-- Aditiva: apenas substitui accept_instructor_offer (mesma assinatura, mesmos grants) acrescentando a checagem acima.
-- Aplicar DEPOIS de 20261117190000_guard_student_meeting_overlap.sql (PR #298). Nao toca em pagamentos nem precos.
begin;
create or replace function public.accept_instructor_offer(p_offer_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=public.require_role(array['instructor']::public.app_role[]);
  req_id uuid; r public.instructor_requests; o public.instructor_offers;
  price public.price_versions; partner public.partners; instructor public.instructors;
  total_lesson integer; total_transport integer; split record; v_booking_id uuid;
  meeting jsonb; position integer:=0;
begin
  select request_id into req_id from public.instructor_offers
    where id=p_offer_id and instructor_id=uid;
  if req_id is null then raise exception 'Offer not found' using errcode='P0002'; end if;
  select * into r from public.instructor_requests where id=req_id for update;
  select * into o from public.instructor_offers where id=p_offer_id for update;
  if r.status<>'searching' or o.status<>'offered' or o.expires_at<=now() or r.expires_at<=now() then
    perform public.advance_instructor_offer(req_id);
    return null;
  end if;
  select * into instructor from public.instructors where id=uid for update;
  if instructor.status<>'approved' or not public.instructor_can_attend(uid,r.meetings)
    or not exists(select 1 from public.instructor_beaches ib
      where ib.instructor_id=uid and ib.beach_id=r.beach_id)
    or r.language<>all(instructor.languages)
    or (r.with_transport and not instructor.has_support_vehicle) then
    update public.instructor_offers set status='declined',responded_at=now() where id=o.id;
    perform public.advance_instructor_offer(req_id);
    return null;
  end if;
  -- P0 #92/#90: o aluno pode ter ganho um encontro sobreposto (outra reserva) enquanto esta oferta estava aberta.
  -- O gatilho da migration 20261117190000 recusaria a reserva com erro 23P01 e a oferta ficaria presa ate vencer; cada
  -- proximo instrutor toparia o mesmo erro. Aqui o conflito encerra o pedido (nada e criado) e o aceite devolve null.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student-meetings:' || r.student_id::text, 0));
  if exists (
    select 1
      from public.booking_meetings m
      join public.bookings b on b.id=m.booking_id
      cross join lateral jsonb_array_elements(r.meetings) pm
     where b.student_id=r.student_id and m.status::text<>'cancelled'
       and (b.status='confirmed' or (b.status='awaiting_payment' and b.created_at>=now()-interval '10 minutes'))
       and tstzrange(m.starts_at,m.starts_at+make_interval(mins=>m.minutes),'[)')
           && tstzrange((pm->>'starts_at')::timestamptz,
                        (pm->>'starts_at')::timestamptz+make_interval(hours=>(pm->>'hours')::integer),'[)')
  ) then
    update public.instructor_offers set status='expired',responded_at=now()
      where request_id=r.id and status in ('offered','suggested');
    update public.instructor_requests set status='cancelled' where id=r.id;
    insert into public.app_notifications(recipient_id,category,title,body,href)
      values(r.student_id,'booking','Busca de instrutor encerrada',
        'Você já tem outro encontro nesse horário, por isso encerramos esta busca. Faça um novo pedido em outro horário.',
        '/aluno/aulas');
    perform public.write_audit('offer.student_conflict','instructor_request',r.id::text,null,
      jsonb_build_object('offer',o.id,'reason','student already has an overlapping meeting'));
    return null;
  end if;
  select * into price from public.price_versions where id=r.price_version_id;
  if price.id is null then raise exception 'Price version unavailable' using errcode='P0002'; end if;
  if r.partner_code is not null
     and not exists(select 1 from public.bookings already
      where already.student_id=r.student_id and already.status in ('confirmed','completed')) then
    select * into partner from public.partners where code=r.partner_code and status='approved';
  end if;
  total_lesson:=r.total_hours*price.hourly_rate_cents;
  total_transport:=case when r.with_transport then r.total_hours*price.transport_hourly_cents else 0 end;
  select * into split from public.split_total(total_lesson,price.platform_commission_bps,partner.commission_bps);
  insert into public.bookings
    (code,student_id,instructor_id,partner_id,price_version_id,beach_id,level,language,total_hours,
     hourly_rate_cents,with_transport,transport_hourly_cents,transport_cents,total_cents,
     partner_cents,platform_cents,instructor_net_cents,presence_code)
  values('VNT-'||nextval('public.booking_code_seq'),r.student_id,uid,partner.id,price.id,
     r.beach_id,r.level,r.language,r.total_hours,price.hourly_rate_cents,
     r.with_transport,case when r.with_transport then price.transport_hourly_cents else 0 end,
     total_transport,total_lesson+total_transport,split.partner_cents,split.platform_cents,
     split.instructor_net_cents+total_transport,
     lpad(floor(random()*10000)::integer::text,4,'0'))
  returning id into v_booking_id;
  for meeting in select value from jsonb_array_elements(r.meetings)
    order by (value->>'starts_at')::timestamptz loop
    position:=position+1;
    insert into public.booking_meetings(booking_id,position,starts_at,minutes)
      values(v_booking_id,position,(meeting->>'starts_at')::timestamptz,(meeting->>'hours')::integer*60);
  end loop;
  update public.instructor_requests set status='accepted',booking_id=v_booking_id
    where id=r.id;
  update public.instructor_offers set status='accepted',responded_at=now() where id=o.id;
  perform public.write_audit('offer.accepted','instructor_offer',o.id::text,null,
    jsonb_build_object('booking',v_booking_id));
  return v_booking_id;
end $$;

revoke execute on function public.accept_instructor_offer(uuid) from public,anon;
grant execute on function public.accept_instructor_offer(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
