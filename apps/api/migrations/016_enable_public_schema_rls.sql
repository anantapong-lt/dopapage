BEGIN;

-- The web application accesses PostgreSQL through the API's server-side
-- DATABASE_URL. Do not expose application tables through Supabase Data API.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;

COMMIT;
