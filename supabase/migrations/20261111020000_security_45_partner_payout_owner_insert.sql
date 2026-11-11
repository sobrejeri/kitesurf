-- VentoKite L0 / issue #145: payout records are keyed by partner owner UID.
-- Correct a non-correlated INSERT check that compared partners.owner_id to partners.id.
-- Do not change financial data, payment processing, or checkout.
DROP POLICY IF EXISTS partner_payout_owner_insert ON public.partner_payout_details;
CREATE POLICY partner_payout_owner_insert
  ON public.partner_payout_details
  FOR INSERT TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.owner_id = (SELECT auth.uid())
    )
  );
