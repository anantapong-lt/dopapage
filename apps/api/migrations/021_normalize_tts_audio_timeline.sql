UPDATE public.tts_jobs
SET audio_timeline = (audio_timeline #>> '{}')::JSONB
WHERE jsonb_typeof(audio_timeline) = 'string'
  AND LTRIM(audio_timeline #>> '{}') LIKE '[%';
