import { db } from '../../../db'
import type {
  CreatedStory,
  GetMyContentsInput,
  MyContentsResult,
  WriterContent,
  WriterContentCount,
  WriterContentDetail,
} from '../../../models/writer-content.model'
import { MODERATION_STATUS, type StoryStatus, type StoryType } from '../../../models/story.model'

export interface WriterContentRecordInput {
  type: StoryType
  title: string
  alternativeTitle: string | null
  slug: string
  synopsis: string | null
  coverUrl: string | null
  coverBlurDataUrl: string | null
  status: StoryStatus
  ageRating: number
  primaryGenreId: string
  secondaryGenreId: string | null
}

export async function findWriterContent(
  creatorUserId: string,
  contentId: string,
  includeLocked = false,
): Promise<WriterContentDetail | undefined> {
  const [story] = await db<WriterContentDetail[]>`
    SELECT id, title, alternative_title, slug, synopsis, cover_url, cover_blur_data_url, type, status, age_rating,
      primary_genre_id, secondary_genre_id
    FROM stories
    WHERE id = ${contentId}
      AND creator_user_id = ${creatorUserId}
      AND deleted_at IS NULL
      AND (${includeLocked} OR moderation_status <> ${MODERATION_STATUS.LOCKED})
    LIMIT 1
  `
  return story
}

export async function findGenreExistence(
  primaryGenreId: string,
  secondaryGenreId: string | null,
): Promise<{ primary_exists: boolean; secondary_exists: boolean }> {
  const [genres] = await db<{ primary_exists: boolean; secondary_exists: boolean }[]>`
    SELECT
      EXISTS (SELECT 1 FROM genres WHERE id = ${primaryGenreId}) AS primary_exists,
      (
        ${secondaryGenreId}::UUID IS NULL
        OR EXISTS (SELECT 1 FROM genres WHERE id = ${secondaryGenreId})
      ) AS secondary_exists
  `
  return genres
}

export async function getWriterContentsByType(
  creatorUserId: string,
  storyType: StoryType,
  input: Pick<GetMyContentsInput, 'page' | 'limit' | 'search' | 'genreIds' | 'status'>,
): Promise<MyContentsResult> {
  const offset = (input.page - 1) * input.limit
  const searchPattern = `%${input.search}%`
  const selectedStatus = input.status ?? ''
  const genreIds = db.array(input.genreIds, 'UUID')
  const [contents, [count]] = await Promise.all([
    db<WriterContent[]>`
      SELECT
        stories.id, stories.title, stories.slug, stories.cover_url,
        stories.cover_blur_data_url, stories.type,
        stories.status, stories.moderation_status, stories.total_views::TEXT,
        (SELECT COUNT(*)::TEXT FROM chapters WHERE chapters.story_id = stories.id) AS chapter_count,
        (
          SELECT ROUND(COALESCE(SUM(chapter_purchases.price), 0), 2)::TEXT
          FROM chapter_purchases
          INNER JOIN chapters AS purchased_chapters
            ON purchased_chapters.id = chapter_purchases.chapter_id
          WHERE purchased_chapters.story_id = stories.id
        ) AS sales_total,
        json_build_object('username', users.username, 'display_name', users.display_name) AS author,
        json_build_object('id', primary_genre.id, 'name', primary_genre.name) AS primary_genre,
        CASE WHEN secondary_genre.id IS NULL THEN NULL
          ELSE json_build_object('id', secondary_genre.id, 'name', secondary_genre.name)
        END AS secondary_genre,
        stories.created_at, stories.updated_at
      FROM stories
      INNER JOIN users ON users.id = stories.creator_user_id
      INNER JOIN genres AS primary_genre ON primary_genre.id = stories.primary_genre_id
      LEFT JOIN genres AS secondary_genre ON secondary_genre.id = stories.secondary_genre_id
      WHERE stories.creator_user_id = ${creatorUserId}
        AND stories.type = ${storyType}
        AND stories.deleted_at IS NULL
        AND stories.moderation_status <> ${MODERATION_STATUS.SUSPENDED}
        AND stories.title ILIKE ${searchPattern}
        AND (
          ${input.genreIds.length} = 0
          OR stories.primary_genre_id = ANY(${genreIds})
          OR stories.secondary_genre_id = ANY(${genreIds})
        )
        AND (${selectedStatus} = '' OR stories.status::TEXT = ${selectedStatus})
      ORDER BY stories.updated_at DESC, stories.id DESC
      LIMIT ${input.limit}
      OFFSET ${offset}
    `,
    db<WriterContentCount[]>`
      SELECT COUNT(*)::TEXT AS total
      FROM stories
      WHERE creator_user_id = ${creatorUserId}
        AND type = ${storyType}
        AND deleted_at IS NULL
        AND moderation_status <> ${MODERATION_STATUS.SUSPENDED}
        AND title ILIKE ${searchPattern}
        AND (
          ${input.genreIds.length} = 0
          OR primary_genre_id = ANY(${genreIds})
          OR secondary_genre_id = ANY(${genreIds})
        )
        AND (${selectedStatus} = '' OR status::TEXT = ${selectedStatus})
    `,
  ])
  const total = Number(count.total)
  return {
    contents,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  }
}

export async function insertWriterContent(
  creatorUserId: string,
  input: WriterContentRecordInput,
): Promise<CreatedStory> {
  const [story] = await db<CreatedStory[]>`
    INSERT INTO stories (
      creator_user_id, type, title, alternative_title, slug, synopsis, cover_url, cover_blur_data_url, status,
      age_rating, primary_genre_id, secondary_genre_id
    ) VALUES (
      ${creatorUserId}, ${input.type}, ${input.title}, ${input.alternativeTitle}, ${input.slug}, ${input.synopsis},
      ${input.coverUrl}, ${input.coverBlurDataUrl}, ${input.status}, ${input.ageRating}, ${input.primaryGenreId},
      ${input.secondaryGenreId}
    )
    RETURNING id, type, slug, cover_url, cover_blur_data_url
  `
  return story
}

export async function updateWriterContentRecord(
  creatorUserId: string,
  contentId: string,
  input: WriterContentRecordInput,
  includeLocked = false,
): Promise<CreatedStory | undefined> {
  const [story] = await db<CreatedStory[]>`
    UPDATE stories
    SET type = ${input.type}, title = ${input.title}, alternative_title = ${input.alternativeTitle}, slug = ${input.slug},
      synopsis = ${input.synopsis}, cover_url = ${input.coverUrl},
      cover_blur_data_url = ${input.coverBlurDataUrl}, status = ${input.status},
      age_rating = ${input.ageRating}, primary_genre_id = ${input.primaryGenreId},
      secondary_genre_id = ${input.secondaryGenreId}, updated_at = NOW()
    WHERE id = ${contentId}
      AND creator_user_id = ${creatorUserId}
      AND deleted_at IS NULL
      AND (${includeLocked} OR moderation_status <> ${MODERATION_STATUS.LOCKED})
    RETURNING id, type, slug, cover_url, cover_blur_data_url
  `
  return story
}

export async function softDeleteWriterContent(
  creatorUserId: string,
  contentId: string,
): Promise<boolean> {
  const [story] = await db<Array<{ id: string }>>`
    UPDATE stories
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${contentId}
      AND creator_user_id = ${creatorUserId}
      AND deleted_at IS NULL
      AND moderation_status <> ${MODERATION_STATUS.LOCKED}
    RETURNING id
  `
  return Boolean(story)
}
