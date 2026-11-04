\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.act_as(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',uid::text,false); EXECUTE 'SET ROLE authenticated'; END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claim.sub','',false); END $$;
DO $$
DECLARE bid uuid; teacher uuid:='00000000-0000-0000-0000-0000000000a1';
 student uuid:='00000000-0000-0000-0000-0000000000b1';
 other_student uuid:='00000000-0000-0000-0000-0000000000b2';
 upload record; mid uuid; older uuid; loc uuid;
BEGIN
 INSERT INTO public.bookings(code,student_id,instructor_id,price_version_id,beach_id,level,language,total_hours,
 hourly_rate_cents,total_cents,partner_cents,platform_cents,instructor_net_cents,presence_code,status)
 SELECT 'VNT-CHAT-37',student,teacher,p.id,b.id,'first_time','Português',1,30000,30000,0,3000,27000,'1234','confirmed'
 FROM public.price_versions p CROSS JOIN public.beaches b WHERE b.slug='prea' ORDER BY p.id DESC LIMIT 1 RETURNING id INTO bid;
 ASSERT bid IS NOT NULL;
 PERFORM pg_temp.act_as(student);
 PERFORM public.touch_my_chat_presence();
 SELECT * INTO upload FROM public.prepare_chat_attachment(bid,'foto.jpg','image/jpeg',1024);
 ASSERT public.chat_upload_owned(upload.object_path,true);
 BEGIN PERFORM public.prepare_chat_attachment(bid,'x','text/html',100); RAISE EXCEPTION 'Unsupported MIME allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.prepare_chat_attachment(bid,'x','image/jpeg',10485761); RAISE EXCEPTION 'Oversized file allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.send_chat_attachment(upload.upload_id); RAISE EXCEPTION 'Missing object accepted';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 PERFORM pg_temp.reset();
 INSERT INTO storage.objects(bucket_id,name) VALUES('vento-chat-files',upload.object_path);
 PERFORM pg_temp.act_as(teacher);
 ASSERT EXISTS(SELECT 1 FROM public.chat_presence WHERE user_id=student),'Shared peer sees presence';
 ASSERT NOT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE id=upload.upload_id),'Pending file private';
 PERFORM pg_temp.reset();
 PERFORM pg_temp.act_as(student);
 mid:=public.send_chat_attachment(upload.upload_id);
 ASSERT public.send_chat_attachment(upload.upload_id)=mid,'Retry must be idempotent';
 ASSERT NOT public.chat_upload_owned(upload.object_path,true),'Published file immutable';
 PERFORM public.set_my_chat_visibility(false);
 PERFORM pg_temp.reset();
 INSERT INTO public.booking_messages(booking_id,sender_id,body,created_at)
 VALUES(bid,student,'Earlier message',now()-interval '1 hour') RETURNING id INTO older;
 PERFORM pg_temp.act_as(teacher);
 ASSERT NOT EXISTS(SELECT 1 FROM public.chat_presence WHERE user_id=student),'Hidden presence is private';
 ASSERT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE message_id=mid),'Published file visible to peer';
 PERFORM public.mark_my_booking_chat_read(bid,mid);
 PERFORM public.mark_my_booking_chat_read(bid,older);
 ASSERT EXISTS(SELECT 1 FROM public.booking_chat_reads WHERE booking_id=bid AND user_id=teacher AND last_message_id=mid),'Read cursor never regresses';
 BEGIN UPDATE public.booking_chat_reads SET message_at=now(); RAISE EXCEPTION 'Direct write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.send_chat_location(bid,91,0); RAISE EXCEPTION 'Invalid location allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 loc:=public.send_chat_location(bid,-2.8,-40.5);
 ASSERT EXISTS(SELECT 1 FROM public.booking_message_locations WHERE message_id=loc);
 PERFORM pg_temp.reset();
 PERFORM pg_temp.act_as(other_student);
 ASSERT NOT public.chat_can_read_booking(bid);
 ASSERT NOT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE booking_id=bid);
 ASSERT NOT EXISTS(SELECT 1 FROM public.booking_message_locations WHERE booking_id=bid);
 ASSERT NOT EXISTS(SELECT 1 FROM public.booking_chat_reads WHERE booking_id=bid);
 BEGIN PERFORM public.prepare_chat_attachment(bid,'x','image/jpeg',100); RAISE EXCEPTION 'Foreign upload allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.mark_my_booking_chat_read(bid,mid); RAISE EXCEPTION 'Foreign receipt allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.reset();
END $$;
ROLLBACK;
