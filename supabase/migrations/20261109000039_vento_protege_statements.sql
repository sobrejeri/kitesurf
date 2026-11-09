-- VentoKite Protege / Stage 3B. VERSIONED PROPOSAL ONLY.
-- Do not apply to the connected Supabase database until the migration history,
-- authorization, backup decision and private Storage policies are reviewed.
-- No checkout, settlement, booking minutes or check-in functions are modified.
BEGIN;

CREATE TABLE public.lesson_protection_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  meeting_id uuid NOT NULL REFERENCES public.booking_meetings(id),
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  instructor_at_statement_id uuid REFERENCES public.profiles(id),
  version integer NOT NULL CHECK (version BETWEEN 1 AND 100),
  declaration text NOT NULL CHECK (declaration IN
    ('delivered','partially_delivered','not_delivered','student_absent','weather_or_safety')),
  claimed_minutes integer NOT NULL CHECK (claimed_minutes BETWEEN 0 AND 480),
  narrative text NOT NULL CHECK (length(btrim(narrative)) BETWEEN 20 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (meeting_id,author_id,version)
);
CREATE INDEX protection_statements_meeting_idx
  ON public.lesson_protection_statements(meeting_id,created_at DESC);
CREATE INDEX protection_statements_author_idx
  ON public.lesson_protection_statements(author_id,created_at DESC);
ALTER TABLE public.lesson_protection_statements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_protection_statements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lesson_protection_statements TO authenticated;
-- Snapshot the instructor at the time of submission. A later replacement
-- never inherits the former pair's testimony, including student narratives.
-- Students and Admin keep case history; the original instructor retains it.
CREATE POLICY protection_statements_participants_read
 ON public.lesson_protection_statements FOR SELECT TO authenticated USING (
   public.is_admin() OR author_id=auth.uid()
   OR instructor_at_statement_id=auth.uid()
   OR EXISTS (
     SELECT 1 FROM public.bookings b WHERE b.id=booking_id
       AND b.student_id=auth.uid()
   )
 );
-- All revisions are append-only. Even the service role cannot rewrite testimony.
CREATE TRIGGER protection_statements_append_only
 BEFORE UPDATE OR DELETE ON public.lesson_protection_statements
 FOR EACH ROW EXECUTE FUNCTION public.reject_change();

CREATE FUNCTION public.submit_lesson_protection_statement(
  p_meeting_id uuid,p_declaration text,p_claimed_minutes integer,p_narrative text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  uid uuid := public.require_role(ARRAY['student','instructor']::public.app_role[]);
  m public.booking_meetings;
  b public.bookings;
  next_version integer;
  result_id uuid;
BEGIN
  -- Serialize submissions for a meeting, preventing duplicate version numbers.
  SELECT * INTO m FROM public.booking_meetings WHERE id=p_meeting_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Meeting unavailable' USING errcode='42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=m.booking_id FOR SHARE;
  IF b.id IS NULL OR b.status NOT IN ('confirmed','completed')
    OR (b.student_id<>uid AND b.instructor_id IS DISTINCT FROM uid) THEN
    RAISE EXCEPTION 'Booking unavailable' USING errcode='42501';
  END IF;
  IF m.starts_at + make_interval(mins=>m.minutes) > now() THEN
    RAISE EXCEPTION 'Meeting has not ended' USING errcode='22023';
  END IF;
  IF p_declaration IS NULL OR p_declaration NOT IN
    ('delivered','partially_delivered','not_delivered','student_absent','weather_or_safety')
    OR p_claimed_minutes IS NULL OR p_claimed_minutes NOT BETWEEN 0 AND m.minutes
    OR p_narrative IS NULL OR length(btrim(p_narrative)) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'Invalid protection statement' USING errcode='22023';
  END IF;
  IF (p_declaration IN ('not_delivered','student_absent','weather_or_safety')
      AND p_claimed_minutes<>0)
    OR (p_declaration='partially_delivered'
      AND (p_claimed_minutes=0 OR p_claimed_minutes>=m.minutes))
    OR (p_declaration='delivered' AND p_claimed_minutes<>m.minutes) THEN
    RAISE EXCEPTION 'Minutes do not match declaration' USING errcode='22023';
  END IF;
  SELECT COALESCE(MAX(version),0)+1 INTO next_version
    FROM public.lesson_protection_statements
    WHERE meeting_id=m.id AND author_id=uid;
  IF next_version>100 THEN
    RAISE EXCEPTION 'Statement version limit exceeded' USING errcode='22023';
  END IF;
  INSERT INTO public.lesson_protection_statements
    (booking_id,meeting_id,author_id,instructor_at_statement_id,version,declaration,claimed_minutes,narrative)
  VALUES(b.id,m.id,uid,b.instructor_id,next_version,p_declaration,p_claimed_minutes,btrim(p_narrative))
  RETURNING id INTO result_id;
  PERFORM public.write_audit('protection.statement_submitted','lesson_protection_statement',
    result_id::text,NULL,jsonb_build_object('booking_id',b.id,'meeting_id',m.id,
    'author_id',uid,'version',next_version,'declaration',p_declaration));
  RETURN result_id;
END $$;

CREATE TABLE public.lesson_protection_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  meeting_id uuid NOT NULL REFERENCES public.booking_meetings(id),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  assessment text NOT NULL CHECK (assessment IN
    ('request_more_evidence','disputed','suggest_reschedule',
     'refund_eligibility_review','no_financial_action')),
  rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 20 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX protection_reviews_meeting_idx
 ON public.lesson_protection_reviews(meeting_id,created_at DESC);
ALTER TABLE public.lesson_protection_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_protection_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lesson_protection_reviews TO authenticated;
-- Administrative assessments are visible to the student and to instructors
-- who already submitted their own testimony before that assessment.
-- A replacement does not inherit older case reviews by assignment alone.
CREATE POLICY protection_reviews_participants_read
 ON public.lesson_protection_reviews FOR SELECT TO authenticated USING (
   public.is_admin()
   OR EXISTS (
     SELECT 1 FROM public.bookings b
     WHERE b.id=booking_id AND b.student_id=auth.uid()
   )
   OR EXISTS (
     SELECT 1 FROM public.lesson_protection_statements s
     WHERE s.meeting_id=lesson_protection_reviews.meeting_id
       AND s.author_id=auth.uid()
       AND s.created_at<=lesson_protection_reviews.created_at
   )
 );
CREATE TRIGGER protection_reviews_append_only
 BEFORE UPDATE OR DELETE ON public.lesson_protection_reviews
 FOR EACH ROW EXECUTE FUNCTION public.reject_change();

CREATE FUNCTION public.review_lesson_protection_case(
 p_meeting_id uuid,p_assessment text,p_rationale text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid := public.require_role(ARRAY['admin']::public.app_role[]);
  m public.booking_meetings; result_id uuid;
BEGIN
 SELECT * INTO m FROM public.booking_meetings WHERE id=p_meeting_id;
 IF m.id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.lesson_protection_statements s WHERE s.meeting_id=m.id
 ) THEN RAISE EXCEPTION 'Case unavailable' USING errcode='P0002'; END IF;
 IF p_assessment IS NULL OR p_assessment NOT IN
  ('request_more_evidence','disputed','suggest_reschedule',
   'refund_eligibility_review','no_financial_action')
   OR p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 20 AND 2000 THEN
   RAISE EXCEPTION 'Invalid case assessment' USING errcode='22023';
 END IF;
 INSERT INTO public.lesson_protection_reviews(booking_id,meeting_id,admin_id,assessment,rationale)
 VALUES(m.booking_id,m.id,uid,p_assessment,btrim(p_rationale)) RETURNING id INTO result_id;
 PERFORM public.write_audit('protection.review_recorded','lesson_protection_review',
   result_id::text,NULL,jsonb_build_object('meeting_id',m.id,'assessment',p_assessment));
 -- An assessment is a recommendation, not a command to refund or pay out.
 RETURN result_id;
END $$;

-- Evidence metadata is private even from the opposing participant by default.
CREATE TABLE public.lesson_protection_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 statement_id uuid NOT NULL REFERENCES public.lesson_protection_statements(id),
 booking_id uuid NOT NULL REFERENCES public.bookings(id),
 meeting_id uuid NOT NULL REFERENCES public.booking_meetings(id),
 uploader_id uuid NOT NULL REFERENCES public.profiles(id),
 object_path text NOT NULL UNIQUE,
 original_name text NOT NULL CHECK(length(btrim(original_name)) BETWEEN 1 AND 180),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
 confirmed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 confirmed_at timestamptz
);
CREATE INDEX protection_evidence_statement_idx ON public.lesson_protection_evidence(statement_id);
ALTER TABLE public.lesson_protection_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_protection_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lesson_protection_evidence TO authenticated;
CREATE POLICY protection_evidence_owner_or_admin
 ON public.lesson_protection_evidence FOR SELECT TO authenticated
 USING (uploader_id=auth.uid() OR public.is_admin());

CREATE TRIGGER protection_evidence_immutable_no_delete
 BEFORE DELETE ON public.lesson_protection_evidence
 FOR EACH ROW EXECUTE FUNCTION public.reject_change();

CREATE FUNCTION public.prepare_lesson_protection_evidence(
 p_statement_id uuid,p_filename text,p_mime text,p_bytes integer
) RETURNS TABLE(upload_id uuid,object_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 uid uuid := public.require_role(ARRAY['student','instructor']::public.app_role[]);
 s public.lesson_protection_statements;
 v_id uuid:=gen_random_uuid(); v_path text;
 v_ext text;
BEGIN
 SELECT * INTO s FROM public.lesson_protection_statements WHERE id=p_statement_id;
 IF s.id IS NULL OR s.author_id<>uid THEN
   RAISE EXCEPTION 'Statement unavailable' USING errcode='42501';
 END IF;
 -- Lock the meeting before checking quotas. This serializes simultaneous
 -- uploads even when they refer to different versions by the same author.
 PERFORM 1 FROM public.booking_meetings WHERE id=s.meeting_id FOR UPDATE;
 IF p_filename IS NULL OR length(btrim(p_filename)) NOT BETWEEN 1 AND 180
   OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 5242880 THEN
   RAISE EXCEPTION 'Invalid evidence file' USING errcode='22023';
 END IF;
 v_ext:=CASE p_mime WHEN 'image/jpeg' THEN 'jpg'
  WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp'
  WHEN 'application/pdf' THEN 'pdf' END;
 IF v_ext IS NULL THEN
   RAISE EXCEPTION 'Unsupported evidence format' USING errcode='22023';
 END IF;
 -- Recent pending uploads count towards the quota. Old failed attempts
 -- cannot permanently prevent the participant from presenting evidence.
 IF (SELECT COUNT(*) FROM public.lesson_protection_evidence
     WHERE statement_id=s.id AND (confirmed OR created_at>now()-interval '30 minutes'))>=6
   OR (SELECT COUNT(*) FROM public.lesson_protection_evidence
     WHERE meeting_id=s.meeting_id AND uploader_id=uid
       AND (confirmed OR created_at>now()-interval '30 minutes'))>=20 THEN
   RAISE EXCEPTION 'Evidence limit reached' USING errcode='22023';
 END IF;
 IF (SELECT COUNT(*) FROM public.lesson_protection_evidence
     WHERE uploader_id=uid AND created_at>now()-interval '10 minutes')>=5 THEN
   RAISE EXCEPTION 'Too many evidence uploads' USING errcode='55000';
 END IF;
 v_path:=s.booking_id::text||'/'||uid::text||'/'||v_id::text||'.'||v_ext;
 INSERT INTO public.lesson_protection_evidence
   (id,statement_id,booking_id,meeting_id,uploader_id,object_path,original_name,mime_type,bytes)
 VALUES(v_id,s.id,s.booking_id,s.meeting_id,uid,v_path,btrim(p_filename),p_mime,p_bytes);
 RETURN QUERY SELECT v_id,v_path;
END $$;

-- Internal RLS helper: not a publicly exposed PostgREST RPC.
CREATE SCHEMA IF NOT EXISTS protection_private;
REVOKE ALL ON SCHEMA protection_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA protection_private TO authenticated;
CREATE FUNCTION protection_private.evidence_storage_access(p_path text,p_for_upload boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.lesson_protection_evidence e
   WHERE e.object_path=p_path
   AND (CASE WHEN p_for_upload
      THEN e.uploader_id=auth.uid() AND NOT e.confirmed
        AND e.created_at>now()-interval '15 minutes'
      ELSE e.confirmed AND (e.uploader_id=auth.uid() OR public.is_admin())
     END));
$$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('vento-protection-evidence','vento-protection-evidence',false,5242880,
 ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY protection_evidence_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='vento-protection-evidence'
   AND protection_private.evidence_storage_access(name,true));
CREATE POLICY protection_evidence_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='vento-protection-evidence'
   AND protection_private.evidence_storage_access(name,false));

CREATE FUNCTION public.confirm_lesson_protection_evidence(p_upload_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=public.require_role(ARRAY['student','instructor']::public.app_role[]);
  e public.lesson_protection_evidence;
BEGIN
 SELECT * INTO e FROM public.lesson_protection_evidence
 WHERE id=p_upload_id AND uploader_id=uid FOR UPDATE;
 IF e.id IS NULL THEN
   RAISE EXCEPTION 'Evidence upload unavailable' USING errcode='42501';
 END IF;
 -- Retrying an already confirmed upload is safe even after the upload window.
 IF e.confirmed THEN RETURN; END IF;
 IF e.created_at<now()-interval '15 minutes' THEN
   RAISE EXCEPTION 'Evidence upload unavailable' USING errcode='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects
     WHERE bucket_id='vento-protection-evidence' AND name=e.object_path) THEN
   RAISE EXCEPTION 'Evidence file not received' USING errcode='P0002';
 END IF;
 UPDATE public.lesson_protection_evidence
   SET confirmed=true,confirmed_at=now() WHERE id=e.id;
 PERFORM public.write_audit('protection.evidence_received','lesson_protection_evidence',
   e.id::text,NULL,jsonb_build_object('statement_id',e.statement_id,'file_type',e.mime_type));
END $$;

REVOKE ALL ON FUNCTION
 public.submit_lesson_protection_statement(uuid,text,integer,text),
 public.review_lesson_protection_case(uuid,text,text),
 public.prepare_lesson_protection_evidence(uuid,text,text,integer),
 public.confirm_lesson_protection_evidence(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION protection_private.evidence_storage_access(text,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.submit_lesson_protection_statement(uuid,text,integer,text),
 public.review_lesson_protection_case(uuid,text,text),
 public.prepare_lesson_protection_evidence(uuid,text,text,integer),
 public.confirm_lesson_protection_evidence(uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION protection_private.evidence_storage_access(text,boolean)
 TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
