-- L0: verify private Storage buckets and row-level policies in isolated PostgreSQL.
-- This test is run by scripts/test-db.sh after all repository migrations.
-- No production data or Storage objects are modified.
DO $test$
DECLARE
  bucket text;
  expected_buckets text[] := ARRAY[
    'vento-chat-files',
    'vento-instructor-avatars',
    'vento-instructor-documents',
    'vento-partner-avatars',
    'vento-protection-evidence',
    'vento-student-avatars'
  ];
BEGIN
  FOREACH bucket IN ARRAY expected_buckets LOOP
    IF NOT EXISTS (
      SELECT 1 FROM storage.buckets b
      WHERE b.id = bucket AND b.public IS FALSE
    ) THEN
      RAISE EXCEPTION 'L0 Storage: bucket % must exist and be private', bucket;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'L0 Storage: storage.objects must have RLS enabled';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
      AND ('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))
  ) THEN
    RAISE EXCEPTION 'L0 Storage: storage.objects must not grant anon/public policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
      AND p.policyname = 'chat_files_read' AND p.cmd = 'SELECT'
      AND 'authenticated' = ANY (p.roles)
  ) THEN
    RAISE EXCEPTION 'L0 Storage: participant-only chat read policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
      AND p.policyname = 'vento_documents_read' AND p.cmd = 'SELECT'
      AND 'authenticated' = ANY (p.roles)
  ) THEN
    RAISE EXCEPTION 'L0 Storage: instructor document read policy missing';
  END IF;
END
$test$;
