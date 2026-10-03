import { db } from '../../db'
import { CHAPTER_STATUS, STORY_STATUS, type StoryType } from '../../models/story.model'
import { USER_STATUS, WRITER_STATUS } from '../../models/user.model'
import { MODERATION_STATUS } from '../../models/story.model'
import type { LandingSection } from './landing.schema'

interface LandingStory {
  id: string
  title: string
  slug: string
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  total_views: string
  ranking_views: string
  favorite_count: string
  rating_average: string
  rating_count: string
  author: {
    id: string
    username: string
    display_name: string
  }
  latest_chapter: {
    id: string
    chapter_number: string
    title: string
    published_at: Date
  }
}

interface LandingStoryCount {
  total: string
}

type ContentDisplayMode = 'hide' | 'both' | 'only'

export interface ContentDisplayFilters {
  age18: ContentDisplayMode
  bl: ContentDisplayMode
  gl: ContentDisplayMode
}

export const DEFAULT_CONTENT_DISPLAY_FILTERS: ContentDisplayFilters = {
  age18: 'both',
  bl: 'both',
  gl: 'both',
}

function asContentDisplayMode(value: unknown): ContentDisplayMode | undefined {
  return value === 'hide' || value === 'both' || value === 'only' ? value : undefined
}

export async function getContentDisplayFilters(userId: string | null): Promise<ContentDisplayFilters> {
  if (!userId) return DEFAULT_CONTENT_DISPLAY_FILTERS

  const [user] = await db<Array<{ reading_settings: unknown }>>`
    SELECT reading_settings
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `
  const settings = user?.reading_settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return DEFAULT_CONTENT_DISPLAY_FILTERS

  const filters = (settings as { contentFilters?: unknown }).contentFilters
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return DEFAULT_CONTENT_DISPLAY_FILTERS

  return {
    age18: asContentDisplayMode((filters as Partial<ContentDisplayFilters>).age18) ?? DEFAULT_CONTENT_DISPLAY_FILTERS.age18,
    bl: asContentDisplayMode((filters as Partial<ContentDisplayFilters>).bl) ?? DEFAULT_CONTENT_DISPLAY_FILTERS.bl,
    gl: asContentDisplayMode((filters as Partial<ContentDisplayFilters>).gl) ?? DEFAULT_CONTENT_DISPLAY_FILTERS.gl,
  }
}

export interface LandingResult {
  section: LandingSection
  stories: LandingStory[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
}

export async function getLandingStories(
  section: LandingSection,
  page: number,
  limit: number,
  categorySlugs: string[] = [],
  search = '',
  contentType: StoryType | null = null,
  contentFilters: ContentDisplayFilters = DEFAULT_CONTENT_DISPLAY_FILTERS,
): Promise<LandingResult> {
  const offset = (page - 1) * limit
  const searchPattern = `%${search}%`
  const categorySlugArray = db.array(categorySlugs, 'TEXT')
  const [stories, [count]] = await Promise.all([
    db<LandingStory[]>`
      SELECT
        stories.id,
        stories.title,
        stories.slug,
        stories.cover_url,
        stories.cover_blur_data_url,
        stories.type,
        stories.total_views::TEXT,
        CASE
          WHEN ${section} = 'weekly'
            THEN COALESCE(weekly_stats.weekly_views, 0)::TEXT
          WHEN ${section} = 'most-followed'
            THEN COALESCE(favorite_stats.favorite_count, 0)::TEXT
          ELSE stories.total_views::TEXT
        END AS ranking_views,
        COALESCE(favorite_stats.favorite_count, 0)::TEXT AS favorite_count,
        COALESCE(rating_stats.rating_average, '0.0') AS rating_average,
        COALESCE(rating_stats.rating_count, '0') AS rating_count,
        json_build_object(
          'id', users.id,
          'username', users.username,
          'display_name', users.display_name
        ) AS author,
        json_build_object(
          'id', latest_chapter.id,
          'chapter_number', latest_chapter.chapter_number::TEXT,
          'title', latest_chapter.title,
          'published_at', latest_chapter.published_at
        ) AS latest_chapter
      FROM stories
      INNER JOIN users ON users.id = stories.creator_user_id
      INNER JOIN LATERAL (
        SELECT chapters.id, chapters.chapter_number, chapters.title,
          chapters.published_at
        FROM chapters
        WHERE chapters.story_id = stories.id
          AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
          AND chapters.published_at <= NOW()
        ORDER BY chapters.chapter_number DESC, chapters.id DESC
        LIMIT 1
      ) AS latest_chapter ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(story_ratings.rating)::NUMERIC, 1)::TEXT AS rating_average,
          COUNT(*)::TEXT AS rating_count
        FROM story_ratings
        WHERE story_ratings.story_id = stories.id
      ) AS rating_stats ON TRUE
      LEFT JOIN (
        SELECT story_id, SUM(view_count)::BIGINT AS weekly_views
        FROM story_daily_views
        WHERE view_date >= (
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::DATE - 6
        )
        GROUP BY story_id
      ) AS weekly_stats ON weekly_stats.story_id = stories.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::BIGINT AS favorite_count
        FROM story_favorites
        WHERE story_favorites.story_id = stories.id
      ) AS favorite_stats ON TRUE
      WHERE stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
        AND stories.deleted_at IS NULL
        AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
        AND users.status = ${USER_STATUS.ACTIVE}
        AND users.writer_status = ${WRITER_STATUS.ACTIVE}
        AND users.deleted_at IS NULL
        AND (${search} = '' OR stories.title ILIKE ${searchPattern})
        AND (${contentType}::story_type IS NULL OR stories.type = ${contentType}::story_type)
        AND (
          ${contentFilters.age18} = 'both'
          OR (${contentFilters.age18} = 'hide' AND COALESCE(stories.age_rating, 0) < 18)
          OR (${contentFilters.age18} = 'only' AND COALESCE(stories.age_rating, 0) >= 18)
        )
        AND (
          ${contentFilters.bl} = 'both'
          OR (${contentFilters.bl} = 'hide' AND NOT EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('bl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
          OR (${contentFilters.bl} = 'only' AND EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('bl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
        )
        AND (
          ${contentFilters.gl} = 'both'
          OR (${contentFilters.gl} = 'hide' AND NOT EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('gl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
          OR (${contentFilters.gl} = 'only' AND EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('gl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
        )
        AND (
          CARDINALITY(${categorySlugArray}) = 0
          OR EXISTS (
            SELECT 1
            FROM genres
            WHERE (
              LOWER(genres.slug) = ANY(${categorySlugArray})
              OR genres.id::TEXT = ANY(${categorySlugArray})
            )
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          )
        )
        AND (
          ${section} <> 'weekly'
          OR COALESCE(weekly_stats.weekly_views, 0) > 0
        )
      ORDER BY
        CASE WHEN ${section} = 'random' THEN md5(stories.id::TEXT) END ASC,
        CASE WHEN ${section} = 'latest' THEN latest_chapter.published_at END DESC,
        CASE WHEN ${section} = 'weekly' THEN COALESCE(weekly_stats.weekly_views, 0) END DESC,
        CASE WHEN ${section} IN ('popular', 'all-time') THEN stories.total_views END DESC,
        CASE WHEN ${section} = 'most-followed' THEN COALESCE(favorite_stats.favorite_count, 0) END DESC,
        stories.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    db<LandingStoryCount[]>`
      SELECT COUNT(*)::TEXT AS total
      FROM stories
      INNER JOIN users ON users.id = stories.creator_user_id
      WHERE stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
        AND stories.deleted_at IS NULL
        AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
        AND users.status = ${USER_STATUS.ACTIVE}
        AND users.writer_status = ${WRITER_STATUS.ACTIVE}
        AND users.deleted_at IS NULL
        AND (${search} = '' OR stories.title ILIKE ${searchPattern})
        AND (${contentType}::story_type IS NULL OR stories.type = ${contentType}::story_type)
        AND (
          ${contentFilters.age18} = 'both'
          OR (${contentFilters.age18} = 'hide' AND COALESCE(stories.age_rating, 0) < 18)
          OR (${contentFilters.age18} = 'only' AND COALESCE(stories.age_rating, 0) >= 18)
        )
        AND (
          ${contentFilters.bl} = 'both'
          OR (${contentFilters.bl} = 'hide' AND NOT EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('bl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
          OR (${contentFilters.bl} = 'only' AND EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('bl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
        )
        AND (
          ${contentFilters.gl} = 'both'
          OR (${contentFilters.gl} = 'hide' AND NOT EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('gl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
          OR (${contentFilters.gl} = 'only' AND EXISTS (
            SELECT 1 FROM genres
            WHERE LOWER(genres.slug) IN ('gl', 'bl-gl')
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          ))
        )
        AND (
          CARDINALITY(${categorySlugArray}) = 0
          OR EXISTS (
            SELECT 1
            FROM genres
            WHERE (
              LOWER(genres.slug) = ANY(${categorySlugArray})
              OR genres.id::TEXT = ANY(${categorySlugArray})
            )
              AND (genres.id = stories.primary_genre_id OR genres.id = stories.secondary_genre_id)
          )
        )
        AND (
          ${section} <> 'weekly'
          OR EXISTS (
            SELECT 1
            FROM story_daily_views
            WHERE story_daily_views.story_id = stories.id
              AND story_daily_views.view_date >= (
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::DATE - 6
              )
              AND story_daily_views.view_count > 0
          )
        )
        AND EXISTS (
          SELECT 1
          FROM chapters
          WHERE chapters.story_id = stories.id
            AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
            AND chapters.published_at <= NOW()
        )
    `,
  ])

  const total = Number(count.total)
  const totalPages = Math.ceil(total / limit)

  return {
    section,
    stories,
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
