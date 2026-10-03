DO $$
BEGIN
  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS reading_settings JSONB NOT NULL DEFAULT '{"fontSize":18,"fontFamily":"sans","theme":"light","autoNext":true,"autoPurchase":false}'::JSONB;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_reading_settings_object_check'
      AND conrelid = 'public.users'::REGCLASS
  ) THEN
    EXECUTE 'ALTER TABLE public.users
      ADD CONSTRAINT users_reading_settings_object_check
      CHECK (jsonb_typeof(reading_settings) = ''object'')';
  END IF;
END $$;
