import { createHash } from 'node:crypto'
import { db } from '../../db'
import { CHAPTER_STATUS, MODERATION_STATUS, STORY_STATUS, type StoryStatus, type StoryType } from '../../models/story.model'
import { USER_STATUS, WRITER_STATUS } from '../../models/user.model'

export interface PublicReaderChapter {
  id: string
  chapter_number: string
  title: string
  is_free: boolean
  price: string
  published_at: Date
  is_purchased: boolean
  can_read: boolean
}

export const CHAPTER_COMMENT_REACTIONS = [
  'like',
  'love',
  'wow',
  'haha',
  'sad',
  'angry',
] as const

export type ChapterCommentReaction = (typeof CHAPTER_COMMENT_REACTIONS)[number]

export interface ChapterComment {
  id: string
  parent_comment_id: string | null
  body: string
  created_at: Date
  is_chapter_owner: boolean
  author: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
  reaction_counts: Partial<Record<ChapterCommentReaction, number>>
  user_reaction: ChapterCommentReaction | null
  replies: ChapterComment[]
}

export interface ChapterCommentReactionSummary {
  reaction_counts: Partial<Record<ChapterCommentReaction, number>>
  user_reaction: ChapterCommentReaction | null
}

export interface ChapterCommentsResult {
  comments: ChapterComment[]
  pagination: {
    page: number
    limit: number
    has_more: boolean
  }
}

export interface PublicChapterForReading {
  id: string
  chapter_number: string
  title: string
  published_at: Date
  can_read: boolean
  story: {
    id: string
    title: string
    slug: string
    type: StoryType
    cover_url: string | null
  }
}

export interface MangaChapterPageRecord {
  id: string
  page_number: number
  image_key: string
  width: number | null
  height: number | null
  alt_text: string | null
}

export interface MangaChapterPagesResult {
  pages: MangaChapterPageRecord[]
  total: number
}

export async function findPublicChapterForReading(
  slug: string,
  chapterNumber: number,
  currentUserId: string | null,
  hasAdminAccess = false,
): Promise<PublicChapterForReading | undefined> {
  const [chapter] = await db<PublicChapterForReading[]>`
    SELECT
      chapters.id,
      chapters.chapter_number::TEXT,
      chapters.title,
      COALESCE(chapters.published_at, chapters.created_at) AS published_at,
      (
        ${hasAdminAccess}
        OR
        COALESCE(stories.creator_user_id = ${currentUserId}::UUID, FALSE)
        OR
        chapters.is_free
        OR EXISTS (
          SELECT 1
          FROM chapter_purchases
          WHERE chapter_purchases.chapter_id = chapters.id
            AND chapter_purchases.buyer_user_id = ${currentUserId}::UUID
        )
      ) AS can_read,
      json_build_object(
        'id', stories.id,
        'title', stories.title,
        'slug', stories.slug,
        'type', stories.type,
        'cover_url', stories.cover_url
      ) AS story
    FROM chapters
    INNER JOIN stories ON stories.id = chapters.story_id
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND chapters.chapter_number = ${chapterNumber}
      AND (
        ${hasAdminAccess}
        OR (
          chapters.status = ${CHAPTER_STATUS.PUBLISHED}
          AND chapters.published_at <= NOW()
          AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
          AND stories.deleted_at IS NULL
          AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
          AND users.status = ${USER_STATUS.ACTIVE}
          AND users.writer_status = ${WRITER_STATUS.ACTIVE}
          AND users.deleted_at IS NULL
        )
      )
    LIMIT 1
  `

  return chapter
}

interface ChapterCommentRow extends Omit<ChapterComment, 'replies'> {}

export async function getChapterCommentsForReading(
  chapterId: string,
  currentUserId: string | null,
  page: number,
  limit: number,
): Promise<ChapterCommentsResult> {
  const offset = (page - 1) * limit
  const [comments, [count]] = await Promise.all([
    db<ChapterCommentRow[]>`
    WITH root_comments AS (
      SELECT
        chapter_comments.id,
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN chapter_comments.user_id = ${currentUserId}::UUID THEN 0 ELSE 1 END ASC,
            (
              SELECT COUNT(*)
              FROM chapter_comment_reactions
              WHERE comment_id = chapter_comments.id
            ) DESC,
            chapter_comments.created_at DESC,
            chapter_comments.id DESC
        ) AS sort_position
      FROM chapter_comments
      INNER JOIN users ON users.id = chapter_comments.user_id
      WHERE chapter_comments.chapter_id = ${chapterId}
        AND chapter_comments.parent_comment_id IS NULL
        AND chapter_comments.deleted_at IS NULL
        AND users.status = ${USER_STATUS.ACTIVE}
        AND users.deleted_at IS NULL
      ORDER BY
        CASE WHEN chapter_comments.user_id = ${currentUserId}::UUID THEN 0 ELSE 1 END ASC,
        (
          SELECT COUNT(*)
          FROM chapter_comment_reactions
          WHERE comment_id = chapter_comments.id
        ) DESC,
        chapter_comments.created_at DESC,
        chapter_comments.id DESC
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT
      chapter_comments.id,
      chapter_comments.parent_comment_id,
      chapter_comments.body,
      chapter_comments.created_at,
      (chapter_comments.user_id = stories.creator_user_id) AS is_chapter_owner,
      json_build_object(
        'id', users.id,
        'username', users.username,
        'display_name', users.display_name,
        'avatar_url', users.avatar_url
      ) AS author,
      COALESCE(reaction_summary.reaction_counts, '{}'::JSONB) AS reaction_counts,
      user_reaction.reaction AS user_reaction
    FROM chapter_comments
    INNER JOIN users ON users.id = chapter_comments.user_id
    INNER JOIN chapters ON chapters.id = chapter_comments.chapter_id
    INNER JOIN stories ON stories.id = chapters.story_id
    LEFT JOIN root_comments AS root_order ON root_order.id = chapter_comments.id
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(reaction, reaction_count) AS reaction_counts
      FROM (
        SELECT reaction, COUNT(*)::INTEGER AS reaction_count
        FROM chapter_comment_reactions
        WHERE comment_id = chapter_comments.id
        GROUP BY reaction
      ) AS grouped_reactions
    ) AS reaction_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT reaction
      FROM chapter_comment_reactions
      WHERE comment_id = chapter_comments.id
        AND user_id = ${currentUserId}::UUID
    ) AS user_reaction ON TRUE
    WHERE chapter_comments.deleted_at IS NULL
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
      AND (
        chapter_comments.id IN (SELECT id FROM root_comments)
        OR chapter_comments.parent_comment_id IN (SELECT id FROM root_comments)
      )
    ORDER BY
      root_order.sort_position ASC NULLS LAST,
      CASE WHEN chapter_comments.parent_comment_id IS NOT NULL THEN chapter_comments.parent_comment_id END ASC,
      CASE WHEN chapter_comments.parent_comment_id IS NOT NULL THEN chapter_comments.created_at END ASC,
      chapter_comments.id ASC
    `,
    db<Array<{ total: string }>>`
      SELECT COUNT(*)::TEXT AS total
      FROM chapter_comments
      INNER JOIN users ON users.id = chapter_comments.user_id
      WHERE chapter_comments.chapter_id = ${chapterId}
        AND chapter_comments.parent_comment_id IS NULL
        AND chapter_comments.deleted_at IS NULL
        AND users.status = ${USER_STATUS.ACTIVE}
        AND users.deleted_at IS NULL
    `,
  ])

  // Reply rows can be returned before their root when timestamps are equal, so
  // register every root first before attaching its replies.
  const roots = new Map<string, ChapterComment>()
  for (const comment of comments) {
    if (!comment.parent_comment_id) {
      roots.set(comment.id, { ...comment, replies: [] })
    }
  }
  for (const comment of comments) {
    if (comment.parent_comment_id) {
      roots.get(comment.parent_comment_id)?.replies.push({ ...comment, replies: [] })
    }
  }

  return {
    comments: [...roots.values()],
    pagination: {
      page,
      limit,
      has_more: page * limit < Number(count.total),
    },
  }
}

export async function addChapterComment(
  chapterId: string,
  currentUserId: string,
  body: string,
  parentCommentId?: string,
): Promise<ChapterComment | null> {
  const trimmedBody = body.trim()
  if (!trimmedBody) return null

  if (parentCommentId) {
    const [parent] = await db<Array<{ id: string }>>`
      SELECT id
      FROM chapter_comments
      WHERE id = ${parentCommentId}
        AND chapter_id = ${chapterId}
        AND parent_comment_id IS NULL
        AND deleted_at IS NULL
      LIMIT 1
    `
    if (!parent) return null
  }

  const [comment] = await db<ChapterCommentRow[]>`
    WITH inserted_comment AS (
      INSERT INTO chapter_comments (chapter_id, user_id, parent_comment_id, body)
      VALUES (${chapterId}, ${currentUserId}, ${parentCommentId ?? null}::UUID, ${trimmedBody})
      RETURNING id, chapter_id, parent_comment_id, body, created_at, user_id
    )
    SELECT
      inserted_comment.id,
      inserted_comment.parent_comment_id,
      inserted_comment.body,
      inserted_comment.created_at,
      (inserted_comment.user_id = stories.creator_user_id) AS is_chapter_owner,
      json_build_object(
        'id', users.id,
        'username', users.username,
        'display_name', users.display_name,
        'avatar_url', users.avatar_url
      ) AS author,
      '{}'::JSONB AS reaction_counts,
      NULL::VARCHAR AS user_reaction
    FROM inserted_comment
    INNER JOIN users ON users.id = inserted_comment.user_id
    INNER JOIN chapters ON chapters.id = inserted_comment.chapter_id
    INNER JOIN stories ON stories.id = chapters.story_id
  `
  return comment ? { ...comment, replies: [] } : null
}

export async function updateChapterCommentById(
  chapterId: string,
  commentId: string,
  currentUserId: string,
  body: string,
): Promise<{ body: string; updated_at: Date } | undefined> {
  const trimmedBody = body.trim()
  if (!trimmedBody) return undefined

  const [comment] = await db<Array<{ body: string; updated_at: Date }>>`
    UPDATE chapter_comments
    SET body = ${trimmedBody}, updated_at = NOW()
    WHERE id = ${commentId}
      AND chapter_id = ${chapterId}
      AND user_id = ${currentUserId}
      AND deleted_at IS NULL
    RETURNING body, updated_at
  `
  return comment
}

export async function deleteChapterCommentById(
  chapterId: string,
  commentId: string,
  currentUserId: string,
): Promise<boolean> {
  const result = await db`
    DELETE FROM chapter_comments
    WHERE id = ${commentId}
      AND chapter_id = ${chapterId}
      AND user_id = ${currentUserId}
      AND deleted_at IS NULL
    RETURNING id
  `
  return result.length > 0
}

export async function setChapterCommentReactionById(
  chapterId: string,
  commentId: string,
  currentUserId: string,
  reaction: ChapterCommentReaction,
): Promise<boolean> {
  const result = await db`
    INSERT INTO chapter_comment_reactions (comment_id, user_id, reaction)
    SELECT id, ${currentUserId}, ${reaction}
    FROM chapter_comments
    WHERE id = ${commentId}
      AND chapter_id = ${chapterId}
      AND deleted_at IS NULL
    ON CONFLICT (comment_id, user_id) DO UPDATE SET
      reaction = EXCLUDED.reaction,
      updated_at = NOW()
    RETURNING comment_id
  `
  return result.length > 0
}

export async function removeChapterCommentReactionById(
  chapterId: string,
  commentId: string,
  currentUserId: string,
): Promise<boolean> {
  const result = await db`
    DELETE FROM chapter_comment_reactions
    WHERE comment_id = ${commentId}
      AND user_id = ${currentUserId}
      AND EXISTS (
        SELECT 1 FROM chapter_comments
        WHERE id = ${commentId} AND chapter_id = ${chapterId}
      )
    RETURNING comment_id
  `
  return result.length > 0
}

export async function getChapterCommentReactionSummary(
  chapterId: string,
  commentId: string,
  currentUserId: string,
): Promise<ChapterCommentReactionSummary | undefined> {
  const [summary] = await db<ChapterCommentReactionSummary[]>`
    SELECT
      COALESCE(reaction_summary.reaction_counts, '{}'::JSONB) AS reaction_counts,
      user_reaction.reaction AS user_reaction
    FROM chapter_comments
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(reaction, reaction_count) AS reaction_counts
      FROM (
        SELECT reaction, COUNT(*)::INTEGER AS reaction_count
        FROM chapter_comment_reactions
        WHERE comment_id = chapter_comments.id
        GROUP BY reaction
      ) AS grouped_reactions
    ) AS reaction_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT reaction
      FROM chapter_comment_reactions
      WHERE comment_id = chapter_comments.id AND user_id = ${currentUserId}
    ) AS user_reaction ON TRUE
    WHERE chapter_comments.id = ${commentId}
      AND chapter_comments.chapter_id = ${chapterId}
      AND chapter_comments.deleted_at IS NULL
  `
  return summary
}

export async function findPublicReaderChapters(
  storyId: string,
  currentUserId: string | null,
  hasAdminAccess = false,
): Promise<PublicReaderChapter[]> {
  return db<PublicReaderChapter[]>`
    SELECT
      chapters.id,
      chapters.chapter_number::TEXT,
      chapters.title,
      chapters.is_free,
      chapters.price::TEXT,
      COALESCE(chapters.published_at, chapters.created_at) AS published_at,
      EXISTS (
        SELECT 1
        FROM chapter_purchases
        WHERE chapter_purchases.chapter_id = chapters.id
          AND chapter_purchases.buyer_user_id = ${currentUserId}::UUID
      ) AS is_purchased,
      (
        ${hasAdminAccess}
        OR
        COALESCE(stories.creator_user_id = ${currentUserId}::UUID, FALSE)
        OR
        chapters.is_free
        OR EXISTS (
          SELECT 1
          FROM chapter_purchases
          WHERE chapter_purchases.chapter_id = chapters.id
            AND chapter_purchases.buyer_user_id = ${currentUserId}::UUID
        )
      ) AS can_read
    FROM chapters
    INNER JOIN stories ON stories.id = chapters.story_id
    WHERE chapters.story_id = ${storyId}
      AND (
        ${hasAdminAccess}
        OR (
          chapters.status = ${CHAPTER_STATUS.PUBLISHED}
          AND chapters.published_at <= NOW()
        )
      )
    ORDER BY chapters.chapter_number ASC, chapters.id ASC
  `
}

export type AudioTimelineEntry = { text: string; start_seconds: number; end_seconds: number }

export async function findNovelChapterContent(chapterId: string): Promise<{
  content: string; audio_url: string | null; audio_timeline: AudioTimelineEntry[]
}> {
  const [chapter] = await db<Array<{ content: string }>>`
    SELECT content
    FROM novel_chapter_contents
    WHERE chapter_id = ${chapterId}
    LIMIT 1
  `
  const content = chapter?.content ?? ''
  const sourceHash = createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex')
  const [audio] = await db<Array<{ audio_url: string | null; audio_timeline: AudioTimelineEntry[] }>>`
    SELECT NULLIF(audio_url, '') AS audio_url, audio_timeline
    FROM tts_jobs
    WHERE chapter_id = ${chapterId}
      AND status = 'done'
      AND source_hash = ${sourceHash}
      AND NULLIF(audio_url, '') IS NOT NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `

  return { content, audio_url: audio?.audio_url ?? null, audio_timeline: audio?.audio_timeline ?? [] }
}

export async function findMangaChapterPages(
  chapterId: string,
  page: number,
  limit: number,
): Promise<MangaChapterPagesResult> {
  const offset = (page - 1) * limit
  const [pages, [count]] = await Promise.all([
    db<MangaChapterPageRecord[]>`
      SELECT id, page_number, image_key, width, height, alt_text
      FROM manga_chapter_pages
      WHERE chapter_id = ${chapterId}
      ORDER BY page_number ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    db<Array<{ total: string }>>`
      SELECT COUNT(*)::TEXT AS total
      FROM manga_chapter_pages
      WHERE chapter_id = ${chapterId}
    `,
  ])

  return { pages, total: Number(count.total) }
}

export async function incrementPublicContentView(storyId: string): Promise<void> {
  await db.begin(async (transaction) => {
    await transaction`
      UPDATE stories
      SET total_views = total_views + 1
      WHERE id = ${storyId}
    `

    await transaction`
      INSERT INTO story_daily_views (story_id, view_date, view_count)
      VALUES (
        ${storyId},
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::DATE,
        1
      )
      ON CONFLICT (story_id, view_date) DO UPDATE SET
        view_count = story_daily_views.view_count + 1
    `
  })
}

export interface PublicContent {
  id: string
  title: string
  slug: string
  synopsis: string | null
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  status: StoryStatus
  age_rating: number | null
  total_views: string
  favorite_count: string
  is_favorited: boolean
  rating_average: string
  rating_count: string
  user_rating: number | null
  published_at: Date | null
  updated_at: Date
  chapter_count: string
  latest_chapter: {
    id: string
    chapter_number: string
    title: string
    published_at: Date
  } | null
  author: {
    id: string
    username: string
    display_name: string
  }
  primary_genre: {
    id: string
    name: string
    slug: string
  }
  secondary_genre: {
    id: string
    name: string
    slug: string
  } | null
}

export async function findPublicContentBySlug(
  slug: string,
  currentUserId: string | null = null,
  hasAdminAccess = false,
): Promise<PublicContent | undefined> {
  const [story] = await db<PublicContent[]>`
    SELECT
      stories.id,
      stories.title,
      stories.slug,
      stories.synopsis,
      stories.cover_url,
      stories.cover_blur_data_url,
      stories.type,
      stories.status,
      stories.age_rating,
      stories.total_views::TEXT,
      (
        SELECT COUNT(*)::TEXT
        FROM story_favorites
        WHERE story_favorites.story_id = stories.id
      ) AS favorite_count,
      EXISTS (
        SELECT 1
        FROM story_favorites
        WHERE story_favorites.story_id = stories.id
          AND story_favorites.user_id = ${currentUserId}::UUID
      ) AS is_favorited,
      COALESCE((
        SELECT ROUND(AVG(story_ratings.rating)::NUMERIC, 1)::TEXT
        FROM story_ratings
        WHERE story_ratings.story_id = stories.id
      ), '0.0') AS rating_average,
      (
        SELECT COUNT(*)::TEXT
        FROM story_ratings
        WHERE story_ratings.story_id = stories.id
      ) AS rating_count,
      (
        SELECT story_ratings.rating::INTEGER
        FROM story_ratings
        WHERE story_ratings.story_id = stories.id
          AND story_ratings.user_id = ${currentUserId}::UUID
      ) AS user_rating,
      stories.published_at,
      stories.updated_at,
      (
        SELECT COUNT(*)::TEXT
        FROM chapters
        WHERE chapters.story_id = stories.id
          AND (
            ${hasAdminAccess}
            OR (
              chapters.status = ${CHAPTER_STATUS.PUBLISHED}
              AND chapters.published_at <= NOW()
            )
          )
      ) AS chapter_count,
      (
        SELECT json_build_object(
          'id', chapters.id,
          'chapter_number', chapters.chapter_number::TEXT,
          'title', chapters.title,
          'published_at', COALESCE(chapters.published_at, chapters.created_at)
        )
        FROM chapters
        WHERE chapters.story_id = stories.id
          AND (
            ${hasAdminAccess}
            OR (
              chapters.status = ${CHAPTER_STATUS.PUBLISHED}
              AND chapters.published_at <= NOW()
            )
          )
        ORDER BY chapters.chapter_number DESC, chapters.id DESC
        LIMIT 1
      ) AS latest_chapter,
      json_build_object(
        'id', users.id,
        'username', users.username,
        'display_name', users.display_name
      ) AS author,
      json_build_object(
        'id', primary_genre.id,
        'name', primary_genre.name,
        'slug', primary_genre.slug
      ) AS primary_genre,
      CASE
        WHEN secondary_genre.id IS NULL THEN NULL
        ELSE json_build_object(
          'id', secondary_genre.id,
          'name', secondary_genre.name,
          'slug', secondary_genre.slug
        )
      END AS secondary_genre
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    INNER JOIN genres AS primary_genre ON primary_genre.id = stories.primary_genre_id
    LEFT JOIN genres AS secondary_genre ON secondary_genre.id = stories.secondary_genre_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND (
        ${hasAdminAccess}
        OR (
          stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
          AND stories.deleted_at IS NULL
          AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
          AND users.status = ${USER_STATUS.ACTIVE}
          AND users.writer_status = ${WRITER_STATUS.ACTIVE}
          AND users.deleted_at IS NULL
        )
      )
    LIMIT 1
  `

  return story
}

export interface PublicContentFavorite {
  is_favorited: boolean
  favorite_count: number
}

export async function getPublicContentFavoriteBySlug(
  slug: string,
  currentUserId: string | null,
): Promise<PublicContentFavorite | undefined> {
  const [favorite] = await db<PublicContentFavorite[]>`
    SELECT
      EXISTS (
        SELECT 1
        FROM story_favorites
        WHERE story_favorites.story_id = stories.id
          AND story_favorites.user_id = ${currentUserId}::UUID
      ) AS is_favorited,
      (
        SELECT COUNT(*)::INTEGER
        FROM story_favorites
        WHERE story_favorites.story_id = stories.id
      ) AS favorite_count
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.writer_status = ${WRITER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
    LIMIT 1
  `

  return favorite
}

export async function addPublicContentFavorite(
  slug: string,
  currentUserId: string,
): Promise<PublicContentFavorite | undefined> {
  const [story] = await db<{ id: string }[]>`
    SELECT stories.id
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.writer_status = ${WRITER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
    LIMIT 1
  `
  if (!story) return undefined

  await db`
    INSERT INTO story_favorites (user_id, story_id)
    VALUES (${currentUserId}, ${story.id})
    ON CONFLICT (user_id, story_id) DO NOTHING
  `

  return getPublicContentFavoriteBySlug(slug, currentUserId)
}

export async function removePublicContentFavorite(
  slug: string,
  currentUserId: string,
): Promise<PublicContentFavorite | undefined> {
  const [story] = await db<{ id: string }[]>`
    SELECT stories.id
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.writer_status = ${WRITER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
    LIMIT 1
  `
  if (!story) return undefined

  await db`
    DELETE FROM story_favorites
    WHERE user_id = ${currentUserId} AND story_id = ${story.id}
  `

  return getPublicContentFavoriteBySlug(slug, currentUserId)
}

export interface PublicContentRating {
  user_rating: number
  rating_average: number
  rating_count: number
}

export async function ratePublicContentBySlug(
  slug: string,
  currentUserId: string,
  rating: number,
): Promise<PublicContentRating | undefined> {
  const [story] = await db<{ id: string }[]>`
    SELECT stories.id
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.writer_status = ${WRITER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
    LIMIT 1
  `
  if (!story) return undefined

  await db`
    INSERT INTO story_ratings (user_id, story_id, rating)
    VALUES (${currentUserId}, ${story.id}, ${rating})
    ON CONFLICT (user_id, story_id) DO UPDATE SET
      rating = EXCLUDED.rating,
      updated_at = NOW()
  `

  const [result] = await db<PublicContentRating[]>`
    SELECT
      ${rating}::INTEGER AS user_rating,
      ROUND(AVG(story_ratings.rating)::NUMERIC, 1)::REAL AS rating_average,
      COUNT(*)::INTEGER AS rating_count
    FROM story_ratings
    WHERE story_ratings.story_id = ${story.id}
  `

  return result
}

export interface PublicChapter {
  id: string
  chapter_number: string
  title: string
  is_free: boolean
  price: string
  published_at: Date
  is_purchased: boolean
  is_owner: boolean
  can_read: boolean
  has_audio: boolean
}

type PublicChapterQueryRow = Omit<PublicChapter, 'has_audio'> & {
  content: string
  audio_source_hash: string | null
}

export interface PublicChaptersResult {
  chapters: PublicChapter[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
}

export type PublicChapterSort = 'latest' | 'oldest' | 'chapter_asc' | 'chapter_desc'

export async function findPublicChaptersBySlug(
  slug: string,
  page: number,
  limit: number,
  currentUserId: string | null,
  sort: PublicChapterSort = 'chapter_desc',
  hasAdminAccess = false,
): Promise<PublicChaptersResult | undefined> {
  const [story] = await db<{ id: string }[]>`
    SELECT stories.id
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE LOWER(stories.slug) = LOWER(${slug})
      AND (
        ${hasAdminAccess}
        OR (
          stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
          AND stories.deleted_at IS NULL
          AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
          AND users.status = ${USER_STATUS.ACTIVE}
          AND users.writer_status = ${WRITER_STATUS.ACTIVE}
          AND users.deleted_at IS NULL
        )
      )
    LIMIT 1
  `
  if (!story) return undefined

  const offset = (page - 1) * limit
  const [chapterRows, [count]] = await Promise.all([
    db<PublicChapterQueryRow[]>`
      SELECT
        chapters.id,
        chapters.chapter_number::TEXT,
        chapters.title,
        chapters.is_free,
        chapters.price::TEXT,
        COALESCE(novel_chapter_contents.content, '') AS content,
        generated_audio.source_hash AS audio_source_hash,
        COALESCE(chapters.published_at, chapters.created_at) AS published_at,
        EXISTS (
          SELECT 1
          FROM chapter_purchases
          WHERE chapter_purchases.chapter_id = chapters.id
            AND chapter_purchases.buyer_user_id = ${currentUserId}::UUID
        ) AS is_purchased,
        COALESCE(stories.creator_user_id = ${currentUserId}::UUID, FALSE) AS is_owner,
        (
          ${hasAdminAccess}
          OR
          COALESCE(stories.creator_user_id = ${currentUserId}::UUID, FALSE)
          OR
          chapters.is_free
          OR EXISTS (
            SELECT 1
            FROM chapter_purchases
            WHERE chapter_purchases.chapter_id = chapters.id
              AND chapter_purchases.buyer_user_id = ${currentUserId}::UUID
          )
        ) AS can_read
      FROM chapters
      INNER JOIN stories ON stories.id = chapters.story_id
      LEFT JOIN novel_chapter_contents ON novel_chapter_contents.chapter_id = chapters.id
      LEFT JOIN LATERAL (
        SELECT source_hash
        FROM tts_jobs
        WHERE tts_jobs.chapter_id = chapters.id
          AND tts_jobs.status = 'done'
          AND NULLIF(tts_jobs.audio_url, '') IS NOT NULL
        ORDER BY tts_jobs.created_at DESC, tts_jobs.id DESC
        LIMIT 1
      ) AS generated_audio ON TRUE
      WHERE chapters.story_id = ${story.id}
        AND (
          ${hasAdminAccess}
          OR (
            chapters.status = ${CHAPTER_STATUS.PUBLISHED}
            AND chapters.published_at <= NOW()
          )
        )
      ORDER BY
        CASE WHEN ${sort} = 'latest' THEN chapters.published_at END DESC,
        CASE WHEN ${sort} = 'oldest' THEN chapters.published_at END ASC,
        CASE WHEN ${sort} = 'chapter_asc' THEN chapters.chapter_number END ASC,
        CASE WHEN ${sort} = 'chapter_desc' THEN chapters.chapter_number END DESC,
        CASE WHEN ${sort} IN ('latest', 'chapter_desc') THEN chapters.id END DESC,
        CASE WHEN ${sort} IN ('oldest', 'chapter_asc') THEN chapters.id END ASC
      LIMIT ${limit} OFFSET ${offset}
    `,
    db<Array<{ total: string }>>`
      SELECT COUNT(*)::TEXT AS total
      FROM chapters
      WHERE story_id = ${story.id}
        AND (
          ${hasAdminAccess}
          OR (
            status = ${CHAPTER_STATUS.PUBLISHED}
            AND published_at <= NOW()
          )
        )
    `,
  ])
  const chapters = chapterRows.map(({ content, audio_source_hash, ...chapter }) => ({
    ...chapter,
    has_audio: audio_source_hash === createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex'),
  }))
  const total = Number(count.total)
  const totalPages = Math.ceil(total / limit)

  return {
    chapters,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  }
}

export interface PublicContentSitemapEntry {
  slug: string
  cover_url: string | null
  updated_at: Date
}

export async function listPublicContentForSitemap(): Promise<PublicContentSitemapEntry[]> {
  return db<PublicContentSitemapEntry[]>`
    SELECT stories.slug, stories.cover_url, stories.updated_at
    FROM stories
    INNER JOIN users ON users.id = stories.creator_user_id
    WHERE stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.writer_status = ${WRITER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
    ORDER BY stories.updated_at DESC, stories.id DESC
  `
}
