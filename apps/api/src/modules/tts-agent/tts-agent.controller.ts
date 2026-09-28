import { status } from 'elysia'
import {
  TtsAgentError, cancelTtsJob, claimNextWriterTtsJob, completeTtsJob, createTtsUploadUrl,
  failTtsJob, listWriterTtsChapters, queueWriterTtsJob, updateTtsProgress,
  listWriterTtsStories, cancelAllWriterTtsJobs, getWriterTtsJobStatus,
} from './tts-agent.service'

function respond(error: unknown) {
  if (error instanceof TtsAgentError) return status(error.statusCode, { message: error.message })
  console.error('TTS agent request failed', error)
  return status(500, { message: 'Unable to process TTS agent request' })
}

export async function listTtsChaptersResponse(userId: string, query: { story_id: string; audio_status?: 'all' | 'missing' | 'available'; page?: number; limit?: number }) {
  try { return await listWriterTtsChapters(userId, query.story_id, query.audio_status ?? 'all', query.page ?? 1, query.limit ?? 20) } catch (error) { return respond(error) }
}
export async function listTtsStoriesResponse(userId: string) {
  try { return { items: await listWriterTtsStories(userId) } } catch (error) { return respond(error) }
}
export async function cancelAllTtsJobsResponse(userId: string) {
  try { return await cancelAllWriterTtsJobs(userId) } catch (error) { return respond(error) }
}
export async function getTtsJobStatusResponse(userId: string, jobId: string) {
  try { return await getWriterTtsJobStatus(userId, jobId) } catch (error) { return respond(error) }
}
export async function queueTtsJobResponse(userId: string, chapterId: string, voiceSlot: string) {
  try { return await queueWriterTtsJob(userId, chapterId, voiceSlot) } catch (error) { return respond(error) }
}
export async function claimTtsJobResponse(userId: string, workerId: string) {
  try { return { job: await claimNextWriterTtsJob(userId, workerId) } } catch (error) { return respond(error) }
}
export async function progressTtsJobResponse(userId: string, jobId: string, workerId: string, completed: number, total: number) {
  try { await updateTtsProgress(userId, jobId, workerId, completed, total); return { success: true } } catch (error) { return respond(error) }
}
export async function uploadTtsJobResponse(userId: string, jobId: string, workerId: string) {
  try { return await createTtsUploadUrl(userId, jobId, workerId) } catch (error) { return respond(error) }
}
export async function completeTtsJobResponse(userId: string, jobId: string, workerId: string, duration: number) {
  try { return await completeTtsJob(userId, jobId, workerId, duration) } catch (error) { return respond(error) }
}
export async function failTtsJobResponse(userId: string, jobId: string, workerId: string, message: string) {
  try { await failTtsJob(userId, jobId, workerId, message); return { success: true } } catch (error) { return respond(error) }
}
export async function cancelTtsJobResponse(userId: string, jobId: string, workerId: string) {
  try { await cancelTtsJob(userId, jobId, workerId); return { success: true } } catch (error) { return respond(error) }
}
