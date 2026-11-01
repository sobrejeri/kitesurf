-- Vento: admin-only avatar references for instructor/partner review lists.
-- Requires the private-profile migrations (instructor 05, partner 22).
-- Do NOT grant admin access to contacts, payouts or documents.
-- Safe to rerun: only idempotent functions/policy changes.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_instructor_avatar_paths()
RETURNS TABLE (user_id uuid, avatar_path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_role(ARRAY['admin']::public.app_role[]);
  RETURN QUERY
    SELECT ip.id, ip.avatar_path
    FROM public.instructor_private_profiles ip
    WHERE ip.avatar_path IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_partner_avatar_paths()
RETURNS TABLE (user_id uuid, avatar_path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_role(ARRAY['admin']::public.app_role[]);
  RETURN QUERY
    SELECT p.id, pp.avatar_path
    FROM public.partners p
    JOIN public.partner_private_profiles pp ON pp.id = p.owner_id
    WHERE pp.avatar_path IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_instructor_avatar_paths() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_partner_avatar_paths() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_instructor_avatar_paths() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_partner_avatar_paths() TO authenticated;

-- Storage is still private. Only an authenticated active admin can generate
-- temporary signed avatar URLs for instructor review; all other objects retain
-- their preexisting owner-scoped Storage policies.
DROP POLICY IF EXISTS vento_instructor_avatar_admin_select ON storage.objects;
CREATE POLICY vento_instructor_avatar_admin_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'vento-instructor-avatars'
  AND (SELECT public.is_admin())
);

NOTIFY pgrst, 'reload schema';
COMMIT;
