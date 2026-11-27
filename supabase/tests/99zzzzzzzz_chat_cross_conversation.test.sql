\set ON_ERROR_STOP on
-- Claims simulate authenticated roles in disposable PostgreSQL, not browser Auth.
BEGIN;
DO $chat_isolation$
DECLARE
  student_a uuid := '00000000-0000-0000-0000-0000000000b1';
  student_b uuid := '00000000-0000-0000-0000-0000000000b2';
  teacher uuid := '00000000-0000-0000-0000-0000000000a1';
  booking_a uuid;
  booking_b uuid;
  message_a uuid;
  message_b uuid;
  published uuid;
  pending record;
  messages_before bigint;
BEGIN
  INSERT INTO public.bookings(
    code,student_id,instructor_id,price_version_id,beach_id,level,language,total_hours,
    hourly_rate_cents,total_cents,partner_cents,platform_cents,instructor_net_cents,presence_code,status)
  SELECT 'VNT-CHAT-ISOLATION-A',student_a,teacher,p.id,b.id,'first_time','Português',1,
    30000,30000,0,3000,27000,'1234','confirmed'
  FROM public.price_versions p CROSS JOIN public.beaches b WHERE b.slug='prea'
  ORDER BY p.id DESC LIMIT 1 RETURNING id INTO booking_a;
  INSERT INTO public.bookings(
    code,student_id,instructor_id,price_version_id,beach_id,level,language,total_hours,
    hourly_rate_cents,total_cents,partner_cents,platform_cents,instructor_net_cents,presence_code,status)
  SELECT 'VNT-CHAT-ISOLATION-B',student_b,teacher,p.id,b.id,'first_time','Português',1,
    30000,30000,0,3000,27000,'5678','confirmed'
  FROM public.price_versions p CROSS JOIN public.beaches b WHERE b.slug='prea'
  ORDER BY p.id DESC LIMIT 1 RETURNING id INTO booking_b;
  ASSERT booking_a IS NOT NULL AND booking_b IS NOT NULL;
  INSERT INTO public.booking_messages(booking_id,sender_id,body,created_at)
    VALUES(booking_a,student_a,'Private conversation A',now()-interval '1 hour')
    RETURNING id INTO message_a;
  INSERT INTO public.booking_messages(booking_id,sender_id,body,created_at)
    VALUES(booking_b,student_b,'Private conversation B',now()-interval '1 hour')
    RETURNING id INTO message_b;

  PERFORM set_config('request.jwt.claim.sub',student_a::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT * INTO pending FROM public.prepare_chat_attachment(booking_a,'private.pdf','application/pdf',100);
  ASSERT EXISTS(SELECT 1 FROM public.booking_messages WHERE id=message_a);
  ASSERT NOT EXISTS(SELECT 1 FROM public.booking_messages WHERE id=message_b),'Foreign text must remain private';
  BEGIN
    PERFORM public.send_booking_message(booking_b,'Forged message');
    RAISE EXCEPTION 'Nonparticipant sent text';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.send_chat_location(booking_b,-2.8,-40.5);
    RAISE EXCEPTION 'Nonparticipant sent location';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  -- A different student cannot publish, discard or inspect the pending upload.
  PERFORM set_config('request.jwt.claim.sub',student_b::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT NOT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE id=pending.upload_id);
  ASSERT NOT public.chat_upload_owned(pending.object_path,true);
  ASSERT NOT public.chat_upload_owned(pending.object_path,false);
  BEGIN
    PERFORM public.send_chat_attachment(pending.upload_id);
    RAISE EXCEPTION 'Foreign upload published';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM public.discard_my_chat_upload(pending.upload_id);
  EXECUTE 'RESET ROLE';
  ASSERT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE id=pending.upload_id AND message_id IS NULL),
    'Foreign discard must leave the pending upload intact';

  INSERT INTO storage.objects(bucket_id,name) VALUES('vento-chat-files',pending.object_path);
  PERFORM set_config('request.jwt.claim.sub',student_a::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  published:=public.send_chat_attachment(pending.upload_id);
  ASSERT published IS NOT NULL;
  EXECUTE 'RESET ROLE';

  -- The teacher participates in both chats: a message ID alone must not move
  -- a receipt into the wrong reservation, even for this authorized teacher.
  PERFORM set_config('request.jwt.claim.sub',teacher::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT public.chat_can_read_booking(booking_a) AND public.chat_can_read_booking(booking_b);
  PERFORM public.mark_my_booking_chat_read(booking_a,message_a);
  BEGIN
    PERFORM public.mark_my_booking_chat_read(booking_a,message_b);
    RAISE EXCEPTION 'Cross-conversation receipt accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  ASSERT EXISTS(SELECT 1 FROM public.booking_chat_reads
    WHERE booking_id=booking_a AND user_id=teacher AND last_message_id=message_a),
    'Rejected foreign message must not change the read cursor';
  ASSERT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE id=pending.upload_id AND message_id=published),
    'The authorized peer must see the published file';
  BEGIN
    PERFORM public.send_chat_attachment(pending.upload_id);
    RAISE EXCEPTION 'Peer republished another sender upload';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  PERFORM public.discard_my_chat_upload(pending.upload_id);
  EXECUTE 'RESET ROLE';
  ASSERT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE id=pending.upload_id AND message_id=published),
    'Published attachment must survive discard attempts';

  -- Losing the eligible booking status immediately removes conversation access.
  UPDATE public.bookings SET status='cancelled',cancelled_at=now() WHERE id=booking_a;
  SELECT count(*) INTO messages_before FROM public.booking_messages WHERE booking_id=booking_a;
  PERFORM set_config('request.jwt.claim.sub',student_a::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT NOT public.chat_can_read_booking(booking_a);
  ASSERT NOT EXISTS(SELECT 1 FROM public.booking_messages WHERE booking_id=booking_a);
  ASSERT NOT EXISTS(SELECT 1 FROM public.booking_message_attachments WHERE booking_id=booking_a);
  ASSERT NOT EXISTS(SELECT 1 FROM public.booking_chat_reads WHERE booking_id=booking_a);
  BEGIN
    PERFORM public.send_booking_message(booking_a,'Message after cancellation');
    RAISE EXCEPTION 'Cancelled conversation accepted text';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.prepare_chat_attachment(booking_a,'late.pdf','application/pdf',100);
    RAISE EXCEPTION 'Cancelled conversation accepted upload';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.mark_my_booking_chat_read(booking_a,published);
    RAISE EXCEPTION 'Cancelled conversation accepted receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  ASSERT (SELECT count(*) FROM public.booking_messages WHERE booking_id=booking_a)=messages_before,
    'Rejected operations must preserve message history';
END $chat_isolation$;
ROLLBACK;
SELECT 'PASS: cross-conversation text, location, upload and receipt ownership; cancellation revokes chat access' AS result;
