import { SQL } from 'bun'
import { env, isDev } from '../config/env'

export const db = new SQL({
  url: env.DATABASE_URL,
  // Supabase session poolers enforce a small connection ceiling. Keep one API
  // process well below it so TTS claim requests are not starved by other APIs.
  max: 3,
  prepare: isDev ? false : true,
})
