-- Proposal only. Install and test on isolated restore, not production.
CREATE OR REPLACE FUNCTION public.validate_booking_input(
  p_student uuid, p_level public.lesson_level, p_language text, p_meetings jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE slot jsonb; lvl public.lesson_level; h numeric; ts timestamptz;
BEGIN
  IF p_student IS DISTINCT FROM auth.uid() OR p_student IS NULL THEN
    RAISE EXCEPTION 'Invalid student' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(assessed_kite_level,self_reported_kite_level) INTO lvl
    FROM public.profiles WHERE id=p_student AND role='student';
  IF lvl IS NULL OR p_level IS NULL OR
    (lvl='returning' AND p_level='first_time') OR
    (lvl='improving' AND p_level<>'improving') THEN
    RAISE EXCEPTION 'Lesson level is not eligible' USING ERRCODE='22023';
  END IF;
  IF p_language IS NULL OR p_language NOT IN ('Português','Inglês','Espanhol','Francês','Alemão','Italiano') THEN
    RAISE EXCEPTION 'Invalid language' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_meetings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid meetings' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_meetings) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Invalid meeting count' USING ERRCODE='22023';
  END IF;
  FOR slot IN SELECT value FROM jsonb_array_elements(p_meetings) LOOP
    IF jsonb_typeof(slot) IS DISTINCT FROM 'object'
      OR jsonb_typeof(slot->'hours') IS DISTINCT FROM 'number'
      OR jsonb_typeof(slot->'starts_at') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid meeting fields' USING ERRCODE='22023';
    END IF;
    BEGIN
      h := (slot->>'hours')::numeric;
      ts := (slot->>'starts_at')::timestamptz;
    EXCEPTION WHEN data_exception THEN
      RAISE EXCEPTION 'Invalid meeting date or hours' USING ERRCODE='22023';
    END;
    IF h NOT BETWEEN 1 AND 8 OR h<>trunc(h) OR NOT isfinite(ts)
      OR ts < now()+interval '1 hour' THEN
      RAISE EXCEPTION 'Invalid meeting date or hours' USING ERRCODE='22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_booking_input(uuid,public.lesson_level,text,jsonb) FROM PUBLIC,anon,authenticated;
-- Integration pending: call from the three canonical SECURITY DEFINER RPCs
-- immediately after role verification and before mutations. Preserve existing
-- signatures, ACLs, pricing, civil-day guards and legacy delegation.
