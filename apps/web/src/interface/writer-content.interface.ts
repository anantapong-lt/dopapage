import type { StoryStatus, StoryType } from '@/constants/story.constant'

export type WriterContentTab = 'novel' | 'cartoon'

export interface WriterContent {
  id: string
  title: string
  slug: string
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  status: StoryStatus
  moderation_status: 'active' | 'hidden' | 'locked' | 'suspended'
  total_views: string
  chapter_count: string
  sales_total: string
  author: { username: string; display_name: string }
  primary_genre: { id: string; name: string }
  secondary_genre: { id: string; name: string } | null
  created_at: string
  updated_at: string
}

export interface WriterContentsResponse {
  contents: WriterContent[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface WriterContentDetail {
  id: string
  title: string
  alternative_title: string | null
  slug: string
  synopsis: string | null
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  status: StoryStatus
  age_rating: number | null
  primary_genre_id: string
  secondary_genre_id: string | null
}
