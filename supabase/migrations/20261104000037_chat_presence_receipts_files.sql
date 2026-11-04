BEGIN;

CREATE FUNCTION public.chat_can_read_booking(p_booking_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.current_app_role() IN ('student','instructor') AND EXISTS(
    SELECT 1 FROM public.bookings b WHERE b.id=p_booking_id
      AND b.status IN ('confirmed','completed') AND b.instructor_id IS NOT NULL
      AND (b.student_id=auth.uid() OR b.instructor_id=auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.chat_can_read_booking(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_can_read_booking(uuid) TO authenticated;

CREATE FUNCTION public.require_chat_booking(p_booking_id uuid) RETURNS public.bookings
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.bookings;
BEGIN
  IF NOT public.chat_can_read_booking(p_booking_id) THEN
    RAISE EXCEPTION 'Conversation unavailable' USING errcode='42501';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id;
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.require_chat_booking(uuid) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.chat_presence(
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now(),
  show_online boolean NOT NULL DEFAULT true
);
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_presence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.chat_presence TO authenticated;
CREATE POLICY chat_presence_participants ON public.chat_presence FOR SELECT TO authenticated USING(
  user_id=auth.uid() OR (show_online AND public.current_app_role() IN ('student','instructor') AND EXISTS(
    SELECT 1 FROM public.bookings b WHERE b.status IN ('confirmed','completed')
      AND ((b.student_id=auth.uid() AND b.instructor_id=user_id)
        OR (b.instructor_id=auth.uid() AND b.student_id=user_id))
  ))
);

CREATE FUNCTION public.touch_my_chat_presence() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
  IF uid IS NULL OR public.current_app_role() NOT IN ('student','instructor') THEN
    RAISE EXCEPTION 'Conversation unavailable' USING errcode='42501';
  END IF;
  INSERT INTO public.chat_presence(user_id) VALUES(uid)
  ON CONFLICT(user_id) DO UPDATE SET last_seen=now()
    WHERE public.chat_presence.last_seen<now()-interval '20 seconds';
END $$;
CREATE FUNCTION public.set_my_chat_visibility(p_visible boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
  IF uid IS NULL OR public.current_app_role() NOT IN ('student','instructor') OR p_visible IS NULL THEN
    RAISE EXCEPTION 'Conversation unavailable' USING errcode='42501';
  END IF;
  INSERT INTO public.chat_presence(user_id,show_online) VALUES(uid,p_visible)
  ON CONFLICT(user_id) DO UPDATE SET show_online=p_visible,
    last_seen=CASE WHEN p_visible THEN now() ELSE public.chat_presence.last_seen END;
END $$;

CREATE TABLE public.booking_chat_reads(
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_id uuid NOT NULL REFERENCES public.booking_messages(id),
  message_at timestamptz NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(booking_id,user_id)
);
ALTER TABLE public.booking_chat_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_chat_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_chat_reads TO authenticated;
CREATE POLICY chat_reads_participants ON public.booking_chat_reads FOR SELECT TO authenticated
  USING(public.chat_can_read_booking(booking_id));
CREATE FUNCTION public.mark_my_booking_chat_read(p_booking_id uuid,p_message_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.booking_messages;
BEGIN
  PERFORM public.require_chat_booking(p_booking_id);
  SELECT * INTO m FROM public.booking_messages WHERE id=p_message_id AND booking_id=p_booking_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Message not found' USING errcode='P0002'; END IF;
  INSERT INTO public.booking_chat_reads(booking_id,user_id,last_message_id,message_at)
  VALUES(p_booking_id,auth.uid(),m.id,m.created_at)
  ON CONFLICT(booking_id,user_id) DO UPDATE SET last_message_id=m.id,message_at=m.created_at,read_at=now()
    WHERE (public.booking_chat_reads.message_at,public.booking_chat_reads.last_message_id)<(m.created_at,m.id);
END $$;

CREATE TABLE public.booking_message_attachments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  message_id uuid UNIQUE REFERENCES public.booking_messages(id) ON DELETE CASCADE,
  object_path text NOT NULL UNIQUE,
  original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_attachments_booking ON public.booking_message_attachments(booking_id,message_id);
ALTER TABLE public.booking_message_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_message_attachments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_message_attachments TO authenticated;
CREATE POLICY chat_attachments_participants ON public.booking_message_attachments FOR SELECT TO authenticated
  USING(public.chat_can_read_booking(booking_id) AND (message_id IS NOT NULL OR sender_id=auth.uid()));

CREATE FUNCTION public.prepare_chat_attachment(p_booking_id uuid,p_name text,p_mime text,p_bytes integer)
RETURNS TABLE(upload_id uuid,object_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid:=gen_random_uuid(); v_path text; ext text;
BEGIN
  PERFORM public.require_chat_booking(p_booking_id);
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 180 OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION 'Invalid file or file exceeds 10 MB' USING errcode='22023';
  END IF;
  ext:=CASE p_mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp'
    WHEN 'image/gif' THEN 'gif' WHEN 'image/heic' THEN 'heic' WHEN 'image/heif' THEN 'heif'
    WHEN 'application/pdf' THEN 'pdf' WHEN 'text/plain' THEN 'txt' WHEN 'text/csv' THEN 'csv'
    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'
    WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN 'xlsx' END;
  IF ext IS NULL THEN RAISE EXCEPTION 'Unsupported file type' USING errcode='22023'; END IF;
  IF (SELECT count(*) FROM public.booking_message_attachments WHERE sender_id=auth.uid()
    AND message_id IS NULL AND created_at>now()-interval '10 minutes')>=5 THEN
    RAISE EXCEPTION 'Too many pending uploads' USING errcode='55000';
  END IF;
  v_path:=p_booking_id::text||'/'||auth.uid()::text||'/'||v_id::text||'.'||ext;
  INSERT INTO public.booking_message_attachments(id,booking_id,sender_id,object_path,original_name,mime_type,bytes)
    VALUES(v_id,p_booking_id,auth.uid(),v_path,btrim(p_name),p_mime,p_bytes);
  RETURN QUERY SELECT v_id,v_path;
END $$;
CREATE FUNCTION public.chat_upload_owned(p_path text,p_writing boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.booking_message_attachments a WHERE a.object_path=p_path
    AND a.sender_id=auth.uid() AND a.message_id IS NULL
    AND (NOT p_writing OR (a.created_at>now()-interval '10 minutes' AND public.chat_can_read_booking(a.booking_id))));
$$;
REVOKE ALL ON FUNCTION public.chat_upload_owned(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_upload_owned(text,boolean) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('vento-chat-files','vento-chat-files',false,10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf','text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
CREATE POLICY chat_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(
  bucket_id='vento-chat-files' AND public.chat_upload_owned(name,true));
CREATE POLICY chat_files_read ON storage.objects FOR SELECT TO authenticated USING(
  bucket_id='vento-chat-files' AND EXISTS(SELECT 1 FROM public.booking_message_attachments a
    WHERE a.object_path=name AND public.chat_can_read_booking(a.booking_id)
      AND (a.message_id IS NOT NULL OR a.sender_id=auth.uid())));
CREATE POLICY chat_files_discard ON storage.objects FOR DELETE TO authenticated USING(
  bucket_id='vento-chat-files' AND public.chat_upload_owned(name,false));

CREATE FUNCTION public.send_chat_attachment(p_upload_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.booking_message_attachments; mid uuid;
BEGIN
  SELECT * INTO a FROM public.booking_message_attachments WHERE id=p_upload_id AND sender_id=auth.uid() FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Upload not found' USING errcode='P0002'; END IF;
  PERFORM public.require_chat_booking(a.booking_id);
  IF a.message_id IS NOT NULL THEN RETURN a.message_id; END IF;
  IF a.created_at<now()-interval '10 minutes' OR NOT EXISTS(SELECT 1 FROM storage.objects
    WHERE bucket_id='vento-chat-files' AND name=a.object_path) THEN
    RAISE EXCEPTION 'Upload unavailable or expired' USING errcode='55000';
  END IF;
  mid:=public.send_booking_message(a.booking_id,
    CASE WHEN a.mime_type LIKE 'image/%' THEN 'Foto: ' ELSE 'Arquivo: ' END||a.original_name);
  UPDATE public.booking_message_attachments SET message_id=mid WHERE id=a.id;
  RETURN mid;
END $$;
CREATE FUNCTION public.discard_my_chat_upload(p_upload_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM public.booking_message_attachments WHERE id=p_upload_id AND sender_id=auth.uid() AND message_id IS NULL;
END $$;

CREATE TABLE public.booking_message_locations(
  message_id uuid PRIMARY KEY REFERENCES public.booking_messages(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180)
);
ALTER TABLE public.booking_message_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_message_locations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_message_locations TO authenticated;
CREATE POLICY chat_locations_participants ON public.booking_message_locations FOR SELECT TO authenticated
  USING(public.chat_can_read_booking(booking_id));
CREATE FUNCTION public.send_chat_location(p_booking_id uuid,p_latitude double precision,p_longitude double precision) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mid uuid;
BEGIN
  PERFORM public.require_chat_booking(p_booking_id);
  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid location' USING errcode='22023';
  END IF;
  mid:=public.send_booking_message(p_booking_id,'Localização compartilhada');
  INSERT INTO public.booking_message_locations(message_id,booking_id,latitude,longitude)
    VALUES(mid,p_booking_id,p_latitude,p_longitude);
  RETURN mid;
END $$;

REVOKE ALL ON FUNCTION public.touch_my_chat_presence(),public.set_my_chat_visibility(boolean),
  public.mark_my_booking_chat_read(uuid,uuid),public.prepare_chat_attachment(uuid,text,text,integer),
  public.send_chat_attachment(uuid),public.discard_my_chat_upload(uuid),public.send_chat_location(uuid,double precision,double precision)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.touch_my_chat_presence(),public.set_my_chat_visibility(boolean),
  public.mark_my_booking_chat_read(uuid,uuid),public.prepare_chat_attachment(uuid,text,text,integer),
  public.send_chat_attachment(uuid),public.discard_my_chat_upload(uuid),public.send_chat_location(uuid,double precision,double precision)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
