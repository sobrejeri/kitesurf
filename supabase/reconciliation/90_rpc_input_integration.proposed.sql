-- Proposal: run after 90_rpc_input_validation.proposed.sql on isolated restore.
-- Fail closed if the reconciled function bodies differ from expected anchors.
BEGIN;
DO $patch$
DECLARE sig text; fn regprocedure; body text; patched text; anchor text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.create_booking(uuid,public.lesson_level,text,jsonb,text,boolean)',
    'public.create_instructor_request(uuid,public.lesson_level,text,jsonb,text,boolean)',
    'public.create_instructor_request_with_preference(uuid,public.lesson_level,text,jsonb,text,boolean,uuid)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NULL THEN RAISE EXCEPTION 'Missing RPC: %',sig; END IF;
    body := pg_get_functiondef(fn);
    anchor := E'begin\n  if price.id is null then';
    IF strpos(body,anchor)=0 OR
      length(body)-length(replace(body,anchor,''))<>length(anchor) THEN
      RAISE EXCEPTION 'Unexpected RPC body: %',sig;
    END IF;
    patched := replace(body,anchor,E'begin\n  perform public.validate_booking_input(uid,p_level,p_language,p_meetings);\n  if price.id is null then');
    EXECUTE patched;
  END LOOP;
END $patch$;
COMMIT;
-- Existing five-argument booking wrapper delegates to the six-argument RPC.
-- CREATE OR REPLACE retains ownership and ACLs. Verify on restore before release.
