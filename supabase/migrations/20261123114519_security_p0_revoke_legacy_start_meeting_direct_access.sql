-- RECONCILIAÇÃO (23/11/2026, lote de 10 atividades, item 1): este arquivo ESPELHA no repositório o hotfix já aplicado no Supabase
-- Kitesurf com a versão 20261123114519 (nome do ledger: security_p0_revoke_legacy_start_meeting_direct_access).
-- NÃO reexecute no projeto onde ele já consta no ledger; use apenas em bancos isolados/descartáveis (é idempotente).
-- O texto foi reconstruído a partir do que foi registrado nas issues #93/#105 (REVOKE em start_meeting, asserções transacionais, reload do PostgREST);
-- compare com `supabase_migrations.schema_migrations.statements` (docs/CONSULTA_RECONCILIACAO_LEDGER_20261123.sql) antes de adotá-lo como idêntico.
-- Mesmo efeito do arquivo 20261121143000_revoke_direct_start_meeting.sql (PR #324), que nunca foi registrado no ledger com aquela versão.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_meeting(uuid, text) FROM authenticated;
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.start_meeting(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_meeting(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P0 start_meeting direct EXECUTE still exposed';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_ordered_meeting(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'start_ordered_meeting must be callable by authenticated only';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
