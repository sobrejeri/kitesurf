BEGIN;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid,text) FROM authenticated;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.start_meeting(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'P0: legacy start_meeting still callable'; END IF;
 IF NOT has_function_privilege('authenticated','public.start_ordered_meeting(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Ordered meeting starter unexpectedly inaccessible'; END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
