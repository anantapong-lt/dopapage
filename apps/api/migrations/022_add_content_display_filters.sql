INSERT INTO public.genres (name, slug)
VALUES
  ('BL', 'bl'),
  ('GL', 'gl')
ON CONFLICT DO NOTHING;

ALTER TABLE public.users
  ALTER COLUMN reading_settings SET DEFAULT '{"fontSize":18,"fontFamily":"sans","theme":"light","autoNext":true,"autoPurchase":false,"contentFilters":{"age18":"both","bl":"both","gl":"both"}}'::JSONB;

UPDATE public.users
SET reading_settings = reading_settings || jsonb_build_object(
  'contentFilters',
  jsonb_build_object(
    'age18', CASE WHEN reading_settings #>> '{contentFilters,age18}' IN ('hide', 'both', 'only') THEN reading_settings #>> '{contentFilters,age18}' ELSE 'both' END,
    'bl', CASE WHEN reading_settings #>> '{contentFilters,bl}' IN ('hide', 'both', 'only') THEN reading_settings #>> '{contentFilters,bl}' ELSE 'both' END,
    'gl', CASE WHEN reading_settings #>> '{contentFilters,gl}' IN ('hide', 'both', 'only') THEN reading_settings #>> '{contentFilters,gl}' ELSE 'both' END
  )
)
WHERE jsonb_typeof(reading_settings) = 'object';
