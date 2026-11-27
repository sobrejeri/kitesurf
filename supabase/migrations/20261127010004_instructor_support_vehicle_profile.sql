-- #99: descriptive profile only; no pricing, eligibility, agenda or snapshot changes.
BEGIN;
CREATE TABLE public.instructor_support_vehicles (
  instructor_id uuid PRIMARY KEY REFERENCES public.instructors(id) ON DELETE RESTRICT,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('buggy','car','pickup','suv','van','other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 2 AND 80),
  passenger_capacity integer NOT NULL CHECK (passenger_capacity BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instructor_support_vehicles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.instructor_support_vehicles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.instructor_support_vehicles TO authenticated;
CREATE POLICY support_vehicle_owner_or_admin_read ON public.instructor_support_vehicles
  FOR SELECT TO authenticated USING (
    ((SELECT public.current_app_role()) = 'instructor'::public.app_role
      AND instructor_id = (SELECT auth.uid()))
    OR (SELECT public.is_admin())
  );
CREATE FUNCTION public.save_my_support_vehicle(
  p_vehicle_type text, p_description text, p_passenger_capacity integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := public.require_role(ARRAY['instructor']::public.app_role[]);
  previous jsonb;
  saved public.instructor_support_vehicles;
BEGIN
  -- require_role also admits administrators; this operation is owner-only.
  IF public.current_app_role() IS DISTINCT FROM 'instructor'::public.app_role
    OR NOT EXISTS (SELECT 1 FROM public.instructors i WHERE i.id=uid) THEN
    RAISE EXCEPTION 'Only the instructor can save their support vehicle' USING ERRCODE='42501';
  END IF;
  IF p_vehicle_type IS NULL OR p_vehicle_type NOT IN ('buggy','car','pickup','suv','van','other')
    OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 2 AND 80
    OR p_passenger_capacity IS NULL OR p_passenger_capacity NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid support vehicle details' USING ERRCODE='22023';
  END IF;
  -- Serialize the owner's first insert and later updates for accurate audit snapshots.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('support-vehicle:' || uid::text,0));
  SELECT to_jsonb(v) INTO previous FROM public.instructor_support_vehicles v WHERE v.instructor_id=uid;
  INSERT INTO public.instructor_support_vehicles(instructor_id,vehicle_type,description,passenger_capacity)
  VALUES(uid,p_vehicle_type,btrim(p_description),p_passenger_capacity)
  ON CONFLICT(instructor_id) DO UPDATE SET
    vehicle_type=EXCLUDED.vehicle_type,description=EXCLUDED.description,
    passenger_capacity=EXCLUDED.passenger_capacity,updated_at=now()
  RETURNING * INTO saved;
  PERFORM public.write_audit('instructor.support_vehicle_saved','instructor_support_vehicle',uid::text,
    previous,to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.save_my_support_vehicle(text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_support_vehicle(text,text,integer) TO authenticated;
COMMIT;
