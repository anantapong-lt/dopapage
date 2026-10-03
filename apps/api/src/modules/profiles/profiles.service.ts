import { db } from '../../db'
import { deleteWriterCoverByUrl, uploadPublicCover } from '../writer/content/writer-cover.service'
import { CHAPTER_STATUS, STORY_STATUS, type StoryStatus, type StoryType } from '../../models/story.model'
import { USER_STATUS, WRITER_STATUS, type UserRole } from '../../models/user.model'
import { MODERATION_STATUS } from '../../models/story.model'

export interface ProfileSocialLinks {
  facebook?: string
  instagram?: string
  x?: string
  tiktok?: string
  youtube?: string
  website?: string
}

export interface ReadingSettings {
  fontSize: number
  fontFamily: 'sans' | 'serif' | 'arial' | 'cordia-new' | 'tf-nopscript' | 'sarabun' | 'noto-serif-thai' | 'prompt' | 'layiji-mahaniyom'
  theme: 'light' | 'sepia' | 'gray' | 'sage' | 'dark'
  autoNext: boolean
  autoPurchase: boolean
  preferredTtsVoice: TtsVoiceSlot
  contentFilters: {
    age18: ContentDisplayMode
    bl: ContentDisplayMode
    gl: ContentDisplayMode
  }
}

type ContentDisplayMode = 'hide' | 'both' | 'only'
type TtsVoiceSlot = 'female' | 'young_male' | 'old_male'

const DEFAULT_CONTENT_FILTERS: ReadingSettings['contentFilters'] = {
  age18: 'both',
  bl: 'both',
  gl: 'both',
}

const DEFAULT_TTS_VOICE: TtsVoiceSlot = 'female'

function ttsVoiceSlot(value: unknown): TtsVoiceSlot | undefined {
  return value === 'female' || value === 'young_male' || value === 'old_male' ? value : undefined
}

function contentDisplayMode(value: unknown): ContentDisplayMode | undefined {
  return value === 'hide' || value === 'both' || value === 'only' ? value : undefined
}

function parseReadingSettings(value: unknown): ReadingSettings | undefined {
  if (typeof value === 'string') {
    try {
      return parseReadingSettings(JSON.parse(value))
    } catch {
      return undefined
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const settings = value as Partial<ReadingSettings>
  const { fontSize, fontFamily, theme, autoNext, autoPurchase } = settings
  if (
    typeof fontSize !== 'number'
    || typeof fontFamily !== 'string'
    || typeof theme !== 'string'
    || typeof autoNext !== 'boolean'
    || typeof autoPurchase !== 'boolean'
  ) return undefined

  const filters = settings.contentFilters
  const contentFilters = filters && typeof filters === 'object' && !Array.isArray(filters)
    ? {
        age18: contentDisplayMode((filters as Partial<ReadingSettings['contentFilters']>).age18) ?? DEFAULT_CONTENT_FILTERS.age18,
        bl: contentDisplayMode((filters as Partial<ReadingSettings['contentFilters']>).bl) ?? DEFAULT_CONTENT_FILTERS.bl,
        gl: contentDisplayMode((filters as Partial<ReadingSettings['contentFilters']>).gl) ?? DEFAULT_CONTENT_FILTERS.gl,
      }
    : DEFAULT_CONTENT_FILTERS

  return {
    fontSize,
    fontFamily,
    theme,
    autoNext,
    autoPurchase,
    preferredTtsVoice: ttsVoiceSlot(settings.preferredTtsVoice) ?? DEFAULT_TTS_VOICE,
    contentFilters,
  }
}

export interface ProfileStory {
  id: string
  title: string
  slug: string
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  status: StoryStatus
  rating_average: string
  chapter_count: string
  latest_chapter: { chapter_number: string } | null
}

export interface FavoriteStory {
  id: string
  title: string
  slug: string
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  status: StoryStatus
  author_name: string
  chapter_count: string
  total_views: string
  favorite_count: string
  latest_chapter: {
    chapter_number: string
    title: string
    published_at: Date
  }
}

export interface FavoriteStoriesResult {
  stories: FavoriteStory[]
  pagination: { page: number; limit: number; has_next_page: boolean }
}

export async function findMyFavoriteStories(
  userId: string,
  type: StoryType,
  page = 1,
  limit = 12,
): Promise<FavoriteStoriesResult> {
  const offset = (page - 1) * limit
  const stories = await db<FavoriteStory[]>`
    SELECT
      stories.id,
      stories.title,
      stories.slug,
      stories.cover_url,
      stories.cover_blur_data_url,
      stories.type,
      stories.status,
      story_creators.display_name AS author_name,
      chapter_stats.chapter_count,
      stories.total_views::TEXT AS total_views,
      favorite_stats.favorite_count,
      json_build_object(
        'chapter_number', latest_chapter.chapter_number::TEXT,
        'title', latest_chapter.title,
        'published_at', latest_chapter.published_at
      ) AS latest_chapter
    FROM story_favorites
    INNER JOIN stories ON stories.id = story_favorites.story_id
    INNER JOIN users AS story_creators ON story_creators.id = stories.creator_user_id
    INNER JOIN LATERAL (
      SELECT COUNT(*)::TEXT AS chapter_count
      FROM chapters
      WHERE chapters.story_id = stories.id
        AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
        AND chapters.published_at <= NOW()
    ) AS chapter_stats ON chapter_stats.chapter_count <> '0'
    INNER JOIN LATERAL (
      SELECT chapter_number, title, COALESCE(published_at, created_at) AS published_at
      FROM chapters
      WHERE chapters.story_id = stories.id
        AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
        AND chapters.published_at <= NOW()
      ORDER BY chapter_number DESC, id DESC
      LIMIT 1
    ) AS latest_chapter ON TRUE
    INNER JOIN LATERAL (
      SELECT COUNT(*)::TEXT AS favorite_count
      FROM story_favorites AS all_favorites
      WHERE all_favorites.story_id = stories.id
    ) AS favorite_stats ON TRUE
    WHERE story_favorites.user_id = ${userId}
      AND stories.type = ${type}
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND story_creators.status = ${USER_STATUS.ACTIVE}
      AND story_creators.writer_status = ${WRITER_STATUS.ACTIVE}
      AND story_creators.deleted_at IS NULL
    ORDER BY story_favorites.created_at DESC, stories.id DESC
    LIMIT ${limit + 1} OFFSET ${offset}
  `

  return {
    stories: stories.slice(0, limit),
    pagination: { page, limit, has_next_page: stories.length > limit },
  }
}

export interface PublicProfile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  profile_cover_url: string | null
  role: UserRole
  bio: string | null
  social_links: ProfileSocialLinks
  created_at: Date
  story_counts: { novel: number; manga: number }
  stories: ProfileStory[]
  pagination: { page: number; limit: number; has_next_page: boolean }
}

interface ProfileStoryCounts {
  novel: number
  manga: number
}

async function findProfileStoryCounts(userId: string, role: UserRole): Promise<ProfileStoryCounts> {
  if (role === 'writer') {
    const [counts] = await db<ProfileStoryCounts[]>`
      SELECT
        (COUNT(*) FILTER (WHERE type = 'novel'))::INTEGER AS novel,
        (COUNT(*) FILTER (WHERE type = 'manga'))::INTEGER AS manga
      FROM stories
      WHERE creator_user_id = ${userId}
        AND status IN ('ongoing', 'completed')
        AND deleted_at IS NULL
        AND moderation_status = ${MODERATION_STATUS.ACTIVE}
        AND EXISTS (
          SELECT 1 FROM chapters
          WHERE chapters.story_id = stories.id
            AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
            AND chapters.published_at <= NOW()
        )
    `
    return counts ?? { novel: 0, manga: 0 }
  }

  const [counts] = await db<ProfileStoryCounts[]>`
    SELECT
      (COUNT(*) FILTER (WHERE stories.type = 'novel'))::INTEGER AS novel,
      (COUNT(*) FILTER (WHERE stories.type = 'manga'))::INTEGER AS manga
    FROM story_favorites
    INNER JOIN stories ON stories.id = story_favorites.story_id
    INNER JOIN users AS story_creators ON story_creators.id = stories.creator_user_id
    WHERE story_favorites.user_id = ${userId}
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND story_creators.status = ${USER_STATUS.ACTIVE}
      AND story_creators.writer_status = ${WRITER_STATUS.ACTIVE}
      AND story_creators.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM chapters
        WHERE chapters.story_id = stories.id
          AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
          AND chapters.published_at <= NOW()
      )
  `
  return counts ?? { novel: 0, manga: 0 }
}

export interface RandomWriterProfile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  story_count: string
}

export async function findRandomWriterProfiles(limit = 5): Promise<RandomWriterProfile[]> {
  return db<RandomWriterProfile[]>`
    SELECT users.id, users.username, users.display_name, users.avatar_url, stories.story_count
    FROM users
    INNER JOIN LATERAL (
      SELECT COUNT(*)::TEXT AS story_count
      FROM stories
      WHERE stories.creator_user_id = users.id
        AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
        AND stories.deleted_at IS NULL
        AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
        AND EXISTS (
          SELECT 1 FROM chapters
          WHERE chapters.story_id = stories.id
            AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
            AND chapters.published_at <= NOW()
        )
    ) AS stories ON stories.story_count <> '0'
    WHERE users.role = 'writer'
      AND users.status = ${USER_STATUS.ACTIVE}
      AND users.writer_status = ${WRITER_STATUS.ACTIVE}
      AND users.deleted_at IS NULL
    ORDER BY RANDOM()
    LIMIT ${limit}
  `
}

export async function findPublicProfileByUsername(username: string, type: StoryType = 'novel', page = 1, limit = 12): Promise<PublicProfile | undefined> {
  const offset = (page - 1) * limit
  const [profile] = await db<Omit<PublicProfile, 'story_counts' | 'stories' | 'pagination'>[]>`
    SELECT id, username, display_name, avatar_url, profile_cover_url, role, bio, social_links, created_at
    FROM users
    WHERE LOWER(username) = LOWER(${username})
      AND status = ${USER_STATUS.ACTIVE}
      AND (role <> 'writer' OR writer_status = ${WRITER_STATUS.ACTIVE})
      AND deleted_at IS NULL
    LIMIT 1
  `
  if (!profile) return undefined

  const [storyCounts, authoredStories] = await Promise.all([
    findProfileStoryCounts(profile.id, profile.role),
    db<ProfileStory[]>`
    SELECT
      stories.id, stories.title, stories.slug, stories.cover_url, stories.cover_blur_data_url,
      stories.type, stories.status,
      COALESCE(ratings.rating_average, '0.0') AS rating_average,
      chapters.chapter_count,
      chapters.latest_chapter
    FROM stories
    INNER JOIN LATERAL (
      SELECT
        COUNT(*)::TEXT AS chapter_count,
        json_build_object('chapter_number', MAX(chapter_number)::TEXT) AS latest_chapter
      FROM chapters
      WHERE chapters.story_id = stories.id
        AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
        AND chapters.published_at <= NOW()
    ) AS chapters ON chapters.chapter_count <> '0'
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(rating)::NUMERIC, 1)::TEXT AS rating_average
      FROM story_ratings
      WHERE story_id = stories.id
    ) AS ratings ON TRUE
    WHERE stories.creator_user_id = ${profile.id}
      AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.type = ${type}
    ORDER BY stories.updated_at DESC, stories.id DESC
    LIMIT ${limit + 1} OFFSET ${offset}
    `,
  ])

  const stories = profile.role === 'writer'
    ? authoredStories
    : await db<ProfileStory[]>`
      SELECT
        stories.id, stories.title, stories.slug, stories.cover_url, stories.cover_blur_data_url,
        stories.type, stories.status,
        COALESCE(ratings.rating_average, '0.0') AS rating_average,
        chapters.chapter_count,
        chapters.latest_chapter
      FROM story_favorites
      INNER JOIN stories ON stories.id = story_favorites.story_id
      INNER JOIN users AS story_creators ON story_creators.id = stories.creator_user_id
      INNER JOIN LATERAL (
        SELECT
          COUNT(*)::TEXT AS chapter_count,
          json_build_object('chapter_number', MAX(chapter_number)::TEXT) AS latest_chapter
        FROM chapters
        WHERE chapters.story_id = stories.id
          AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
          AND chapters.published_at <= NOW()
      ) AS chapters ON chapters.chapter_count <> '0'
      LEFT JOIN LATERAL (
        SELECT ROUND(AVG(rating)::NUMERIC, 1)::TEXT AS rating_average
        FROM story_ratings
        WHERE story_id = stories.id
      ) AS ratings ON TRUE
      WHERE story_favorites.user_id = ${profile.id}
        AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
      AND stories.deleted_at IS NULL
      AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
      AND story_creators.status = ${USER_STATUS.ACTIVE}
      AND story_creators.writer_status = ${WRITER_STATUS.ACTIVE}
        AND story_creators.deleted_at IS NULL
        AND stories.type = ${type}
      ORDER BY story_favorites.created_at DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `

  return {
    ...profile,
    story_counts: storyCounts,
    stories: stories.slice(0, limit),
    pagination: { page, limit, has_next_page: stories.length > limit },
  }
}

export async function findMyProfile(userId: string): Promise<PublicProfile | undefined> {
  const [profile] = await db<Omit<PublicProfile, 'story_counts' | 'stories' | 'pagination'>[]>`
    SELECT id, username, display_name, avatar_url, profile_cover_url, role, bio, social_links, created_at
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `
  if (!profile) return undefined

  const [storyCounts, stories] = await Promise.all([
    findProfileStoryCounts(userId, profile.role),
    profile.role === 'writer'
    ? findPublicProfileByUsername(profile.username).then((result) => result?.stories ?? [])
    : db<ProfileStory[]>`
      SELECT
        stories.id, stories.title, stories.slug, stories.cover_url, stories.cover_blur_data_url,
        stories.type, stories.status,
        COALESCE(ratings.rating_average, '0.0') AS rating_average,
        chapters.chapter_count,
        chapters.latest_chapter
      FROM story_favorites
      INNER JOIN stories ON stories.id = story_favorites.story_id
      INNER JOIN users AS story_creators ON story_creators.id = stories.creator_user_id
      INNER JOIN LATERAL (
        SELECT
          COUNT(*)::TEXT AS chapter_count,
          json_build_object('chapter_number', MAX(chapter_number)::TEXT) AS latest_chapter
        FROM chapters
        WHERE chapters.story_id = stories.id
          AND chapters.status = ${CHAPTER_STATUS.PUBLISHED}
          AND chapters.published_at <= NOW()
      ) AS chapters ON chapters.chapter_count <> '0'
      LEFT JOIN LATERAL (
        SELECT ROUND(AVG(rating)::NUMERIC, 1)::TEXT AS rating_average
        FROM story_ratings
        WHERE story_id = stories.id
      ) AS ratings ON TRUE
      WHERE story_favorites.user_id = ${userId}
        AND stories.status IN (${STORY_STATUS.ONGOING}, ${STORY_STATUS.COMPLETED})
        AND stories.deleted_at IS NULL
        AND story_creators.status = ${USER_STATUS.ACTIVE}
        AND story_creators.deleted_at IS NULL
      ORDER BY story_favorites.created_at DESC
      `,
  ])

  return { ...profile, story_counts: storyCounts, stories, pagination: { page: 1, limit: stories.length, has_next_page: false } }
}

export async function findReadingSettings(userId: string): Promise<ReadingSettings | undefined> {
  const [user] = await db<Array<{ reading_settings: unknown }>>`
    SELECT reading_settings
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `
  return parseReadingSettings(user?.reading_settings)
}

export async function updateReadingSettings(
  userId: string,
  settings: ReadingSettings,
): Promise<ReadingSettings | undefined> {
  const [user] = await db<Array<{ reading_settings: unknown }>>`
    UPDATE users
    SET reading_settings = jsonb_build_object(
      'fontSize', ${settings.fontSize}::INTEGER,
      'fontFamily', ${settings.fontFamily}::TEXT,
      'theme', ${settings.theme}::TEXT,
      'autoNext', ${settings.autoNext}::BOOLEAN,
      'autoPurchase', ${settings.autoPurchase}::BOOLEAN,
      'preferredTtsVoice', ${settings.preferredTtsVoice}::TEXT,
      'contentFilters', jsonb_build_object(
        'age18', ${settings.contentFilters.age18}::TEXT,
        'bl', ${settings.contentFilters.bl}::TEXT,
        'gl', ${settings.contentFilters.gl}::TEXT
      )
    ), updated_at = NOW()
    WHERE id = ${userId} AND deleted_at IS NULL
    RETURNING reading_settings
  `
  return parseReadingSettings(user?.reading_settings)
}

export async function updateMyProfile(
  userId: string,
  input: { bio?: string | null; social_links?: ProfileSocialLinks },
): Promise<PublicProfile | undefined> {
  const bio = input.bio === undefined ? undefined : input.bio?.trim() || null
  const socialLinks = input.social_links === undefined
    ? undefined
    : Object.fromEntries(Object.entries(input.social_links)
      .map(([key, value]) => [key, value?.trim()])
      .filter(([, value]) => Boolean(value)))

  if (input.bio !== undefined) {
    await db`
      UPDATE users SET bio = ${bio}, updated_at = NOW()
      WHERE id = ${userId} AND deleted_at IS NULL
    `
  }
  if (input.social_links !== undefined) {
    await db`
      UPDATE users SET social_links = ${JSON.stringify(socialLinks)}::JSONB, updated_at = NOW()
      WHERE id = ${userId} AND deleted_at IS NULL
    `
  }

  return findMyProfile(userId)
}

export async function updateMyProfileCover(userId: string, cover: File): Promise<PublicProfile | undefined> {
  const [currentProfile] = await db<Array<{ profile_cover_url: string | null }>>`
    SELECT profile_cover_url
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `
  if (!currentProfile) return undefined

  const uploadedCover = await uploadPublicCover(cover, 'profiles/covers', {
    width: 1600,
    height: 900,
    quality: 82,
  })

  await db`
    UPDATE users SET profile_cover_url = ${uploadedCover.cover_url}, updated_at = NOW()
    WHERE id = ${userId} AND deleted_at IS NULL
  `

  if (currentProfile.profile_cover_url) {
    await deleteWriterCoverByUrl(currentProfile.profile_cover_url)
  }

  return findMyProfile(userId)
}

export async function updateMyProfileAvatar(userId: string, avatar: File): Promise<PublicProfile | undefined> {
  const [currentProfile] = await db<Array<{ avatar_url: string | null }>>`
    SELECT avatar_url
    FROM users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `
  if (!currentProfile) return undefined

  const uploadedAvatar = await uploadPublicCover(avatar, 'profiles/avatars', {
    width: 512,
    height: 512,
    quality: 82,
  })

  await db`
    UPDATE users SET avatar_url = ${uploadedAvatar.cover_url}, updated_at = NOW()
    WHERE id = ${userId} AND deleted_at IS NULL
  `

  if (currentProfile.avatar_url) {
    await deleteWriterCoverByUrl(currentProfile.avatar_url)
  }

  return findMyProfile(userId)
}
