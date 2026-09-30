import { t } from 'elysia'

export const ttsChapterListQuerySchema = t.Object({
  story_id: t.String({ format: 'uuid' }),
  audio_status: t.Optional(t.Union([t.Literal('all'), t.Literal('missing'), t.Literal('available')])),
  sort_by: t.Optional(t.Union([
    t.Literal('chapter_asc'), t.Literal('chapter_desc'), t.Literal('title_asc'), t.Literal('title_desc'),
  ])),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
})

export const ttsJobParamsSchema = t.Object({ id: t.String({ format: 'uuid' }) })
export const ttsWorkerParamsSchema = t.Object({ workerId: t.String({ format: 'uuid' }) })

export const queueTtsJobBodySchema = t.Object({
  chapter_id: t.String({ format: 'uuid' }),
  voice_slot: t.Union([t.Literal('old_male'), t.Literal('young_male'), t.Literal('female')]),
})

export const agentLoginBodySchema = t.Object({
  email: t.String({ format: 'email', maxLength: 320 }),
  password: t.String({ minLength: 1, maxLength: 128 }),
  device_name: t.String({ minLength: 1, maxLength: 120 }),
})

export const agentRefreshBodySchema = t.Object({ refresh_token: t.String({ minLength: 1, maxLength: 4096 }) })

export const agentProgressBodySchema = t.Object({
  worker_id: t.String({ format: 'uuid' }),
  completed_blocks: t.Integer({ minimum: 0 }),
  total_blocks: t.Integer({ minimum: 1 }),
})

export const agentCompleteBodySchema = t.Object({
  worker_id: t.String({ format: 'uuid' }),
  duration_seconds: t.Numeric({ minimum: 0 }),
})

export const agentWorkerBodySchema = t.Object({ worker_id: t.String({ format: 'uuid' }) })

export const agentFailBodySchema = t.Object({
  worker_id: t.String({ format: 'uuid' }),
  error_message: t.String({ minLength: 1, maxLength: 2000 }),
})
