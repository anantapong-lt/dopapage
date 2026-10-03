import type { StoryStatus, StoryType } from '@/constants/story.constant'

interface ContentGenre {
  id: string
  name: string
  slug: string
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
  published_at: string | null
  updated_at: string
  chapter_count: string
  latest_chapter: {
    id: string
    chapter_number: string
    title: string
    published_at: string
  } | null
  author: {
    id: string
    username: string
    display_name: string
  }
  primary_genre: ContentGenre
  secondary_genre: ContentGenre | null
}

export interface PublicContentResponse {
  story: PublicContent
  chapters: PublicChaptersResponse
}

export interface PublicContentFavoriteResponse {
  is_favorited: boolean
  favorite_count: number
}

export interface PublicContentRatingResponse {
  user_rating: number
  rating_average: number
  rating_count: number
}

export type PublicChapterSort = 'latest' | 'oldest' | 'chapter_asc' | 'chapter_desc'

export interface PublicChapter {
  id: string
  chapter_number: string
  title: string
  is_free: boolean
  price: string
  published_at: string
  is_purchased: boolean
  is_owner: boolean
  can_read: boolean
  has_audio: boolean
}

export interface PublicChaptersResponse {
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

export interface PublicContentSitemapResponse {
  contents: Array<{
    slug: string
    cover_url: string | null
    updated_at: string
  }>
}

export interface PublicReaderChapter {
  id: string
  chapter_number: string
  title: string
  is_free: boolean
  price: string
  published_at: string
  is_purchased: boolean
  can_read: boolean
}

export interface PublicMangaChapterPage {
  id: string
  page_number: number
  image_url: string
  width: number | null
  height: number | null
  alt_text: string | null
}

export interface PublicMangaChapterPagesResponse {
  pages: PublicMangaChapterPage[]
  pagination: {
    page: number
    limit: number
    total: number
    has_next_page: boolean
  }
}

export interface PublicChapterResponse {
  story: {
    id: string
    title: string
    slug: string
    type: StoryType
    cover_url: string | null
  }
  chapter: {
    id: string
    chapter_number: string
    title: string
    published_at: string
  }
  chapters: PublicReaderChapter[]
  content: string | null
  audio_url: string | null
  audio_versions: Array<{
    voice_slot: 'female' | 'young_male' | 'old_male'
    audio_url: string
    audio_timeline: Array<{
      text?: string
      start_offset?: number
      end_offset?: number
      start_seconds: number
      end_seconds: number
    }>
  }>
  audio_timeline: Array<{
    text?: string
    start_offset?: number
    end_offset?: number
    start_seconds: number
    end_seconds: number
  }>
  pages: PublicMangaChapterPage[]
  manga_page_pagination: {
    page: number
    limit: number
    total: number
    has_next_page: boolean
  }
}

export const CHAPTER_COMMENT_REACTION_TYPES = [
  'like',
  'love',
  'wow',
  'haha',
  'sad',
  'angry',
] as const

export type ChapterCommentReaction = (typeof CHAPTER_COMMENT_REACTION_TYPES)[number]

export interface ChapterComment {
  id: string
  parent_comment_id: string | null
  body: string
  created_at: string
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

export interface ChapterCommentsResponse {
  comments: ChapterComment[]
  pagination: {
    page: number
    limit: number
    has_more: boolean
  }
}

export interface ChapterCommentReactionResponse {
  reaction_counts: Partial<Record<ChapterCommentReaction, number>>
  user_reaction: ChapterCommentReaction | null
}
