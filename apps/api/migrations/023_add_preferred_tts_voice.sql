ALTER TABLE public.users
  ALTER COLUMN reading_settings SET DEFAULT '{"fontSize":18,"fontFamily":"sans","theme":"light","autoNext":true,"autoPurchase":false,"preferredTtsVoice":"female","contentFilters":{"age18":"both","bl":"both","gl":"both"}}'::JSONB;

UPDATE public.users
SET reading_settings = reading_settings || jsonb_build_object(
  'preferredTtsVoice',
  CASE
    WHEN reading_settings->>'preferredTtsVoice' IN ('female', 'young_male', 'old_male')
      THEN reading_settings->>'preferredTtsVoice'
    ELSE 'female'
  END
)
WHERE jsonb_typeof(reading_settings) = 'object';
