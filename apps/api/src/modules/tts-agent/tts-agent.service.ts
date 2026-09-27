import { createHash } from 'node:crypto'
import { db } from '../../db'
import { TTS_JOB_STATUS, type TtsJobStatus } from '../../models/tts-job.model'
import { createAssetUploadUrl, createPublicAssetUrl } from '../assets/local-asset.service'

const LEASE_SECONDS = 30 * 60

export class TtsAgentError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 | 503) {
    super(message)
    this.name = 'TtsAgentError'
  }
}

function sourceHash(content: string) {
  return createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex')
}

function plainText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-zA-Z0-9#]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function listWriterTtsStories(userId: string) {
  return db<{ id: string; title: string }[]>`
    SELECT s.id, s.title FROM stories s
    WHERE s.creator_user_id = ${userId} AND s.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM chapters c
        INNER JOIN novel_chapter_contents n ON n.chapter_id = c.id
        WHERE c.story_id = s.id
      )
    ORDER BY s.updated_at DESC, s.id
  `
}

export async function listWriterTtsChapters(userId: string, storyId: string, page: number, limit: number) {
  const offset = (page - 1) * limit
  const [items, [count]] = await Promise.all([
    db<{
      chapter_id: string; story_id: string; story_title: string; chapter_number: string; chapter_title: string
      chapter_status: string; word_count: number; latest_job_status: TtsJobStatus | null; latest_job_id: string | null
      latest_voice_slot: string | null; latest_progress: number | null
    }[]>`
      SELECT c.id AS chapter_id, s.id AS story_id, s.title AS story_title,
        c.chapter_number::TEXT, c.title AS chapter_title, c.status AS chapter_status,
        n.word_count,
        j.status AS latest_job_status, j.id AS latest_job_id, j.voice_slot AS latest_voice_slot,
        CASE WHEN j.total_blocks IS NULL OR j.total_blocks = 0 THEN NULL
          ELSE ROUND(j.completed_blocks::NUMERIC * 100 / j.total_blocks)::INTEGER END AS latest_progress
      FROM chapters c
      INNER JOIN stories s ON s.id = c.story_id
      INNER JOIN novel_chapter_contents n ON n.chapter_id = c.id
      LEFT JOIN LATERAL (
        SELECT id, status, voice_slot, completed_blocks, total_blocks
        FROM tts_jobs WHERE chapter_id = c.id AND requested_by = ${userId}
        ORDER BY created_at DESC LIMIT 1
      ) j ON TRUE
      WHERE s.creator_user_id = ${userId} AND s.deleted_at IS NULL
        AND s.id = ${storyId}::UUID
        AND NOT EXISTS (
          SELECT 1 FROM tts_jobs audio
          WHERE audio.chapter_id = c.id AND audio.status = ${TTS_JOB_STATUS.DONE}
            AND (NULLIF(audio.audio_key, '') IS NOT NULL OR NULLIF(audio.audio_url, '') IS NOT NULL)
        )
      ORDER BY c.chapter_number ASC, c.id
      LIMIT ${limit} OFFSET ${offset}
    `,
    db<{ total: string }[]>`
      SELECT COUNT(*)::TEXT AS total FROM chapters c
      INNER JOIN stories s ON s.id = c.story_id
      INNER JOIN novel_chapter_contents n ON n.chapter_id = c.id
      WHERE s.creator_user_id = ${userId} AND s.deleted_at IS NULL
        AND s.id = ${storyId}::UUID
        AND NOT EXISTS (
          SELECT 1 FROM tts_jobs audio
          WHERE audio.chapter_id = c.id AND audio.status = ${TTS_JOB_STATUS.DONE}
            AND (NULLIF(audio.audio_key, '') IS NOT NULL OR NULLIF(audio.audio_url, '') IS NOT NULL)
        )
    `,
  ])
  const total = Number(count.total)
  return { items, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } }
}

export async function queueWriterTtsJob(userId: string, chapterId: string, voiceSlot: string) {
  const [chapter] = await db<{ content: string }[]>`
    SELECT n.content FROM chapters c
    INNER JOIN stories s ON s.id = c.story_id
    INNER JOIN novel_chapter_contents n ON n.chapter_id = c.id
    WHERE c.id = ${chapterId} AND s.creator_user_id = ${userId} AND s.deleted_at IS NULL
    LIMIT 1
  `
  if (!chapter) throw new TtsAgentError('Chapter not found or is not a novel chapter', 404)
  const hash = sourceHash(chapter.content)
  const [job] = await db<{ id: string; status: TtsJobStatus; voice_slot: string; created_at: Date }[]>`
    INSERT INTO tts_jobs (chapter_id, requested_by, source_hash, voice_slot)
    VALUES (${chapterId}, ${userId}, ${hash}, ${voiceSlot})
    ON CONFLICT (requested_by, chapter_id, source_hash, voice_slot)
      WHERE status IN (${TTS_JOB_STATUS.QUEUED}, ${TTS_JOB_STATUS.PROCESSING})
      DO UPDATE SET updated_at = NOW()
    RETURNING id, status, voice_slot, created_at
  `
  return job
}

export async function claimNextWriterTtsJob(userId: string, workerId: string) {
  const jobs = await db<{
    id: string; chapter_id: string; voice_slot: string; content: string; source_hash: string
    story_title: string; chapter_title: string; chapter_number: string
  }[]>`
    WITH candidate AS (
      SELECT j.id
      FROM tts_jobs j
      INNER JOIN chapters c ON c.id = j.chapter_id
      INNER JOIN stories s ON s.id = c.story_id
      INNER JOIN novel_chapter_contents n ON n.chapter_id = c.id
      WHERE j.requested_by = ${userId}
        AND (j.status = ${TTS_JOB_STATUS.QUEUED}
          OR (j.status = ${TTS_JOB_STATUS.PROCESSING} AND j.lease_expires_at < NOW()))
      ORDER BY j.created_at
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    )
    UPDATE tts_jobs j
    SET status = ${TTS_JOB_STATUS.PROCESSING}, worker_id = ${workerId}::UUID,
      lease_expires_at = NOW() + (${LEASE_SECONDS} * INTERVAL '1 second'),
      attempt_count = attempt_count + 1, started_at = COALESCE(started_at, NOW()),
      completed_blocks = 0, total_blocks = NULL, error_message = NULL, updated_at = NOW()
    FROM candidate, chapters c, stories s, novel_chapter_contents n
    WHERE j.id = candidate.id AND c.id = j.chapter_id AND s.id = c.story_id AND n.chapter_id = c.id
    RETURNING j.id, j.chapter_id, j.voice_slot, n.content, j.source_hash, s.title AS story_title,
      c.title AS chapter_title, c.chapter_number::TEXT
  `
  const job = jobs[0]
  if (!job) return null
  if (sourceHash(job.content) !== job.source_hash) {
    await db`
      UPDATE tts_jobs SET status = ${TTS_JOB_STATUS.CANCELLED}, error_message = 'Chapter content changed before rendering',
        lease_expires_at = NULL, updated_at = NOW()
      WHERE id = ${job.id} AND worker_id = ${workerId}::UUID AND status = ${TTS_JOB_STATUS.PROCESSING}
    `
    return claimNextWriterTtsJob(userId, workerId)
  }
  return { ...job, text: plainText(job.content), content: undefined }
}

export async function updateTtsProgress(userId: string, jobId: string, workerId: string, completed: number, total: number) {
  if (completed > total) throw new TtsAgentError('Completed blocks cannot exceed total blocks', 400)
  const rows = await db`
    UPDATE tts_jobs SET completed_blocks = ${completed}, total_blocks = ${total},
      lease_expires_at = NOW() + (${LEASE_SECONDS} * INTERVAL '1 second'), updated_at = NOW()
    WHERE id = ${jobId} AND requested_by = ${userId} AND worker_id = ${workerId}::UUID
      AND status = ${TTS_JOB_STATUS.PROCESSING} AND lease_expires_at > NOW()
    RETURNING id
  `
  if (!rows.length) throw new TtsAgentError('Job was not claimed by this agent or its lease expired', 409)
}

export async function createTtsUploadUrl(userId: string, jobId: string, workerId: string) {
  const [job] = await db<{
    id: string; story_id: string; chapter_number: string; attempt_count: number
  }[]>`
    SELECT j.id, c.story_id, c.chapter_number::TEXT, j.attempt_count
    FROM tts_jobs j
    INNER JOIN chapters c ON c.id = j.chapter_id
    WHERE j.id = ${jobId} AND j.requested_by = ${userId} AND j.worker_id = ${workerId}::UUID
      AND j.status = ${TTS_JOB_STATUS.PROCESSING} AND j.lease_expires_at > NOW()
    LIMIT 1
  `
  if (!job) throw new TtsAgentError('Job was not claimed by this agent or its lease expired', 409)
  // Match manga chapter storage; use a stable, unique filename because both
  // upload-url and completion resolve this key independently.
  const storageKey = `stories/chapters/${job.story_id}/${Number(job.chapter_number)}/${job.id}-${job.attempt_count}.mp3`
  const upload = createAssetUploadUrl(storageKey, 'public')
  return { audio_key: upload.key, upload_url: upload.uploadUrl }
}

export async function completeTtsJob(userId: string, jobId: string, workerId: string, durationSeconds: number) {
  const [current] = await db<{ content: string; source_hash: string }[]>`
    SELECT n.content, j.source_hash FROM tts_jobs j
    INNER JOIN novel_chapter_contents n ON n.chapter_id = j.chapter_id
    WHERE j.id = ${jobId} AND j.requested_by = ${userId}
      AND j.worker_id = ${workerId}::UUID AND j.status = ${TTS_JOB_STATUS.PROCESSING}
    LIMIT 1
  `
  if (!current || sourceHash(current.content) !== current.source_hash) {
    await db`
      UPDATE tts_jobs SET status = ${TTS_JOB_STATUS.CANCELLED}, error_message = 'Chapter content changed during rendering',
        lease_expires_at = NULL, updated_at = NOW()
      WHERE id = ${jobId} AND requested_by = ${userId} AND worker_id = ${workerId}::UUID
        AND status = ${TTS_JOB_STATUS.PROCESSING}
    `
    throw new TtsAgentError('Chapter content changed during rendering', 409)
  }
  const upload = await createTtsUploadUrl(userId, jobId, workerId)
  const audioUrl = createPublicAssetUrl(upload.audio_key)
  const rows = await db`
    UPDATE tts_jobs SET status = ${TTS_JOB_STATUS.DONE}, audio_key = ${upload.audio_key}, audio_url = ${audioUrl},
      duration_seconds = ROUND(${durationSeconds}::NUMERIC, 3), completed_at = NOW(),
      lease_expires_at = NULL, updated_at = NOW()
    WHERE id = ${jobId} AND requested_by = ${userId} AND worker_id = ${workerId}::UUID
      AND status = ${TTS_JOB_STATUS.PROCESSING} AND lease_expires_at > NOW()
    RETURNING id
  `
  if (!rows.length) throw new TtsAgentError('Job could not be completed', 409)
  return { audio_key: upload.audio_key, audio_url: audioUrl }
}

export async function failTtsJob(userId: string, jobId: string, workerId: string, errorMessage: string) {
  const rows = await db`
    UPDATE tts_jobs SET status = ${TTS_JOB_STATUS.FAILED}, error_message = ${errorMessage}, lease_expires_at = NULL,
      updated_at = NOW()
    WHERE id = ${jobId} AND requested_by = ${userId} AND worker_id = ${workerId}::UUID
      AND status = ${TTS_JOB_STATUS.PROCESSING}
    RETURNING id
  `
  if (!rows.length) throw new TtsAgentError('Job could not be marked as failed', 409)
}

export async function cancelTtsJob(userId: string, jobId: string, workerId: string) {
  const rows = await db`
    UPDATE tts_jobs SET status = ${TTS_JOB_STATUS.CANCELLED}, error_message = 'Rendering cancelled by writer or agent shutdown',
      lease_expires_at = NULL, updated_at = NOW()
    WHERE id = ${jobId} AND requested_by = ${userId} AND worker_id = ${workerId}::UUID
      AND status IN (${TTS_JOB_STATUS.PROCESSING}, ${TTS_JOB_STATUS.CANCELLED})
    RETURNING id
  `
  if (!rows.length) throw new TtsAgentError('Job could not be cancelled', 409)
}

export async function cancelAllWriterTtsJobs(userId: string) {
  const rows = await db<{ id: string }[]>`
    UPDATE tts_jobs SET status = ${TTS_JOB_STATUS.CANCELLED},
      error_message = 'All active TTS jobs cancelled by writer',
      lease_expires_at = NULL, updated_at = NOW()
    WHERE requested_by = ${userId}
      AND status IN (${TTS_JOB_STATUS.QUEUED}, ${TTS_JOB_STATUS.PROCESSING})
    RETURNING id
  `
  return { cancelled_count: rows.length }
}

export async function getWriterTtsJobStatus(userId: string, jobId: string) {
  const [job] = await db<{ id: string; status: TtsJobStatus }[]>`
    SELECT id, status FROM tts_jobs WHERE id = ${jobId} AND requested_by = ${userId}
  `
  if (!job) throw new TtsAgentError('Job not found', 404)
  return job
}
