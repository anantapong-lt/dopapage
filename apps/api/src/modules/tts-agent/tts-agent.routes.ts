import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import {
  agentCompleteBodySchema, agentFailBodySchema, agentProgressBodySchema, agentWorkerBodySchema, queueTtsJobBodySchema,
  ttsChapterListQuerySchema, ttsJobParamsSchema, ttsWorkerParamsSchema,
} from './tts-agent.schema'
import {
  cancelTtsJobResponse, claimTtsJobResponse, completeTtsJobResponse, failTtsJobResponse, listTtsChaptersResponse, progressTtsJobResponse,
  queueTtsJobResponse, uploadTtsJobResponse,
  listTtsStoriesResponse, cancelAllTtsJobsResponse, getTtsJobStatusResponse,
} from './tts-agent.controller'

export const ttsAgentRoutes = new Elysia({ prefix: '/writer/tts' })
  .use(authMiddleware)
  .get('/stories', ({ currentUser }) => listTtsStoriesResponse(currentUser.id), { auth: USER_ROLE.WRITER })
  .get('/chapters', ({ currentUser, query }) => listTtsChaptersResponse(currentUser.id, query), {
    auth: USER_ROLE.WRITER, query: ttsChapterListQuerySchema,
  })
  .post('/jobs', ({ currentUser, body }) => queueTtsJobResponse(currentUser.id, body.chapter_id, body.voice_slot), {
    auth: USER_ROLE.WRITER, body: queueTtsJobBodySchema,
  })
  .post('/jobs/cancel-all', ({ currentUser }) => cancelAllTtsJobsResponse(currentUser.id), { auth: USER_ROLE.WRITER })
  .get('/jobs/:id', ({ currentUser, params }) => getTtsJobStatusResponse(currentUser.id, params.id), {
    auth: USER_ROLE.WRITER, params: ttsJobParamsSchema,
  })
  .post('/jobs/claim/:workerId', ({ currentUser, params }) => claimTtsJobResponse(currentUser.id, params.workerId), {
    auth: USER_ROLE.WRITER, params: ttsWorkerParamsSchema,
  })
  .patch('/jobs/:id/progress', ({ currentUser, params, body }) => progressTtsJobResponse(
    currentUser.id, params.id, body.worker_id, body.completed_blocks, body.total_blocks,
  ), { auth: USER_ROLE.WRITER, params: ttsJobParamsSchema, body: agentProgressBodySchema })
  .post('/jobs/:id/upload-url', ({ currentUser, params, body }) => uploadTtsJobResponse(currentUser.id, params.id, body.worker_id), {
    auth: USER_ROLE.WRITER, params: ttsJobParamsSchema, body: agentWorkerBodySchema,
  })
  .post('/jobs/:id/complete', ({ currentUser, params, body }) => completeTtsJobResponse(
    currentUser.id, params.id, body.worker_id, body.duration_seconds, body.audio_timeline ?? [],
  ), { auth: USER_ROLE.WRITER, params: ttsJobParamsSchema, body: agentCompleteBodySchema })
  .post('/jobs/:id/fail', ({ currentUser, params, body }) => failTtsJobResponse(
    currentUser.id, params.id, body.worker_id, body.error_message,
  ), { auth: USER_ROLE.WRITER, params: ttsJobParamsSchema, body: agentFailBodySchema })
  .post('/jobs/:id/cancel', ({ currentUser, params, body }) => cancelTtsJobResponse(
    currentUser.id, params.id, body.worker_id,
  ), { auth: USER_ROLE.WRITER, params: ttsJobParamsSchema, body: agentWorkerBodySchema })
