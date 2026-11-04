-- Migration 33 | Show the request details only to the offered instructor.
-- The old unqualified `id` resolved to instructor_offers.id inside EXISTS,
-- causing request_id = offer.id instead of request_id = request.id.
BEGIN;

DROP POLICY IF EXISTS request_visible_to_participants ON public.instructor_requests;
CREATE POLICY request_visible_to_participants
ON public.instructor_requests FOR SELECT TO authenticated
USING (
  instructor_requests.student_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.instructor_offers AS offered
    WHERE offered.request_id = instructor_requests.id
      AND offered.instructor_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
