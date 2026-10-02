import type {
  CreatedStory,
  CreateWriterContentInput,
  GetMyContentsInput,
  MyContentsResult,
  UpdateWriterContentInput,
  WriterContentDetail,
} from '../../../models/writer-content.model'
import { STORY_TYPE } from '../../../models/story.model'
import { deleteWriterCover, deleteWriterCoverByUrl, uploadWriterCover } from './writer-cover.service'
import {
  findGenreExistence,
  findWriterContent,
  getWriterContentsByType,
  insertWriterContent,
  softDeleteWriterContent,
  updateWriterContentRecord,
} from './writer-content.service'

const WRITER_COVER_OPTIMIZATION = { quality: 80, width: 1200, height: 1600 } as const

export class CreateWriterContentError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 | 409,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'CreateWriterContentError'
  }
}

function optionalText(value?: string): string | null {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : null
}

function parseAgeRating(value: string): number {
  const ageRating = Number(value.trim())
  if (ageRating !== 0 && ageRating !== 18) {
    throw new CreateWriterContentError('กรุณาเลือกระดับเนื้อหา', 400, 'age_rating')
  }
  return ageRating
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const postgresError = error as Record<string, unknown>
  return postgresError.code === '23505' || postgresError.errno === '23505'
}

const RANDOM_SLUG_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const RANDOM_SLUG_LENGTH = 15

function createRandomSlug(): string {
  const randomValues = crypto.getRandomValues(new Uint8Array(RANDOM_SLUG_LENGTH))
  return Array.from(randomValues, (value) => RANDOM_SLUG_CHARACTERS[value % RANDOM_SLUG_CHARACTERS.length]).join('')
}

async function validateGenres(primaryGenreId: string, secondaryGenreId: string | null) {
  if (secondaryGenreId === primaryGenreId) {
    throw new CreateWriterContentError('หมวดหมู่หลักและหมวดหมู่รองต้องไม่ซ้ำกัน', 400, 'secondary_genre_id')
  }

  const genres = await findGenreExistence(primaryGenreId, secondaryGenreId)
  if (!genres.primary_exists) {
    throw new CreateWriterContentError('ไม่พบหมวดหมู่หลักที่เลือก', 400, 'primary_genre_id')
  }
  if (!genres.secondary_exists) {
    throw new CreateWriterContentError('ไม่พบหมวดหมู่รองที่เลือก', 400, 'secondary_genre_id')
  }
}

export async function getWriterContent(
  creatorUserId: string,
  contentId: string,
  includeLocked = false,
): Promise<WriterContentDetail> {
  const story = await findWriterContent(creatorUserId, contentId, includeLocked)
  if (!story) throw new CreateWriterContentError('ไม่พบเนื้อหาที่ต้องการแก้ไข', 404)
  return story
}

export function getMyContents(creatorUserId: string, input: GetMyContentsInput): Promise<MyContentsResult> {
  const storyType = input.tab === 'cartoon' ? STORY_TYPE.MANGA : STORY_TYPE.NOVEL
  console.log(creatorUserId, input)
  return getWriterContentsByType(creatorUserId, storyType, input)
}

export async function deleteWriterContent(creatorUserId: string, contentId: string): Promise<void> {
  const deleted = await softDeleteWriterContent(creatorUserId, contentId)
  if (!deleted) throw new CreateWriterContentError('ไม่พบผลงานที่ต้องการลบ หรือผลงานถูกล็อคโดยระบบ', 404)
}

export async function createWriterContent(
  creatorUserId: string,
  input: CreateWriterContentInput,
): Promise<CreatedStory> {
  const title = input.title.trim()
  const alternativeTitle = optionalText(input.alternative_title)
  const shouldGenerateSlug = input.auto_generate_slug === 'true'
  const submittedSlug = input.slug?.trim() ?? ''
  const slug = shouldGenerateSlug ? createRandomSlug() : submittedSlug
  const synopsis = optionalText(input.synopsis)
  const secondaryGenreId = optionalText(input.secondary_genre_id)
  const ageRating = parseAgeRating(input.age_rating)

  if (!title) throw new CreateWriterContentError('กรุณากรอกชื่อเรื่อง', 400, 'title')
  if (!shouldGenerateSlug && !slug) {
    throw new CreateWriterContentError('กรุณากรอกลิงก์ URL', 400, 'slug')
  }
  await validateGenres(input.primary_genre_id, secondaryGenreId)

  const uploadedCover = input.cover ? await uploadWriterCover(input.cover, WRITER_COVER_OPTIMIZATION) : null
  try {
    return await insertWriterContent(creatorUserId, {
      type: input.type,
      title,
      alternativeTitle,
      slug,
      synopsis,
      coverUrl: uploadedCover?.cover_url ?? null,
      coverBlurDataUrl: uploadedCover?.cover_blur_data_url ?? null,
      status: input.status,
      ageRating,
      primaryGenreId: input.primary_genre_id,
      secondaryGenreId,
    })
  } catch (error) {
    if (uploadedCover) {
      try {
        await deleteWriterCover(uploadedCover.key)
      } catch (deleteError) {
        console.error('Unable to remove orphaned writer cover', deleteError)
      }
    }
    if (isUniqueViolation(error)) {
      throw new CreateWriterContentError('ลิงก์ URL นี้ถูกใช้งานแล้ว', 409, 'slug')
    }
    throw error
  }
}

export async function updateWriterContent(
  creatorUserId: string,
  contentId: string,
  input: UpdateWriterContentInput,
  includeLocked = false,
): Promise<CreatedStory> {
  const existingStory = await getWriterContent(creatorUserId, contentId, includeLocked)
  const title = input.title.trim()
  const alternativeTitle = optionalText(input.alternative_title)
  const slug = input.slug.trim()
  const synopsis = optionalText(input.synopsis)
  const secondaryGenreId = optionalText(input.secondary_genre_id)
  const ageRating = parseAgeRating(input.age_rating)

  if (!title) throw new CreateWriterContentError('กรุณากรอกชื่อเรื่อง', 400, 'title')
  await validateGenres(input.primary_genre_id, secondaryGenreId)

  const uploadedCover = input.cover ? await uploadWriterCover(input.cover, WRITER_COVER_OPTIMIZATION) : null
  const shouldRemoveCover = input.remove_cover === 'true'
  const previousCoverUrl = existingStory.cover_url
  const previousCoverBlurDataUrl = existingStory.cover_blur_data_url
  const hasCoverChanged = Boolean(uploadedCover) || shouldRemoveCover
  const nextCoverUrl = uploadedCover?.cover_url ?? (shouldRemoveCover ? null : previousCoverUrl)
  const nextCoverBlurDataUrl =
    uploadedCover?.cover_blur_data_url ?? (shouldRemoveCover ? null : previousCoverBlurDataUrl)

  try {
    const story = await updateWriterContentRecord(
      creatorUserId,
      contentId,
      {
        type: input.type,
        title,
        alternativeTitle,
        slug,
        synopsis,
        coverUrl: nextCoverUrl,
        coverBlurDataUrl: nextCoverBlurDataUrl,
        status: input.status,
        ageRating,
        primaryGenreId: input.primary_genre_id,
        secondaryGenreId,
      },
      includeLocked,
    )
    if (!story) throw new CreateWriterContentError('ไม่พบเนื้อหาที่ต้องการแก้ไข', 404)

    if (previousCoverUrl && hasCoverChanged) {
      try {
        await deleteWriterCoverByUrl(previousCoverUrl)
      } catch (deleteError) {
        console.error('Unable to remove replaced writer cover', deleteError)
      }
    }
    return story
  } catch (error) {
    if (uploadedCover) {
      try {
        await deleteWriterCover(uploadedCover.key)
      } catch (deleteError) {
        console.error('Unable to remove orphaned writer cover', deleteError)
      }
    }
    if (isUniqueViolation(error)) {
      throw new CreateWriterContentError('ลิงก์ URL นี้ถูกใช้งานแล้ว', 409, 'slug')
    }
    throw error
  }
}
