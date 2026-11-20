-- Tela "Perfil do instrutor" (aluno): leitura limitada e SÓ para quem tem reserva com aquele instrutor.
-- Nada de PII: sem telefone, cidade, CPF, documentos nem nome de quem avaliou. Só instrutor aprovado.
-- Função nova, somente leitura, SECURITY DEFINER com checagem de papel e de dono (reserva do próprio aluno).
-- Não altera tabelas, policies nem funções existentes.
BEGIN;
CREATE FUNCTION public.get_instructor_public_profile(p_instructor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := public.require_role(ARRAY['student']::public.app_role[]);
  v_result jsonb;
BEGIN
  -- Ler por id não é permissão: o aluno só vê instrutores das próprias reservas ativas ou concluídas.
  IF p_instructor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = v_uid AND b.instructor_id = p_instructor_id
      AND b.status IN ('confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'Instructor not found' USING errcode = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'id', i.id,
    'name', p.full_name,
    'years_experience', i.years_experience,
    'languages', to_jsonb(i.languages),
    'beaches', COALESCE((
      SELECT jsonb_agg(be.name ORDER BY be.name)
      FROM public.instructor_beaches ib JOIN public.beaches be ON be.id = ib.beach_id
      WHERE ib.instructor_id = i.id AND be.active), '[]'::jsonb),
    'bio', COALESCE(pp.bio, ''),
    'rating_count', (SELECT count(*) FROM public.instructor_ratings r WHERE r.instructor_id = i.id),
    'rating_avg', (SELECT round(avg(r.stars)::numeric, 1) FROM public.instructor_ratings r WHERE r.instructor_id = i.id),
    'reviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stars', x.stars, 'comment', x.comment, 'created_at', x.created_at) ORDER BY x.created_at DESC)
      FROM (SELECT r.stars, r.comment, r.created_at FROM public.instructor_ratings r
            WHERE r.instructor_id = i.id AND r.comment <> '' ORDER BY r.created_at DESC LIMIT 10) x), '[]'::jsonb)
  ) INTO v_result
  FROM public.instructors i
  JOIN public.profiles p ON p.id = i.id
  LEFT JOIN public.instructor_private_profiles pp ON pp.id = i.id
  WHERE i.id = p_instructor_id AND i.status = 'approved';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Instructor not found' USING errcode = 'P0002';
  END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_instructor_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_instructor_public_profile(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
