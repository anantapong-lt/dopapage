import type { ModerationStatus, StoryStatus, StoryType } from './story.model'

export type WriterContentTab = 'novel' | 'cartoon'

export interface GetMyContentsInput {
  tab: WriterContentTab
  page: number
  limit: number
}

export interface WriterContent {
  id: string
  title: string
  slug: string
  cover_url: string | null
  cover_blur_data_url: string | null
  type: StoryType
  status: StoryStatus
  moderation_status: ModerationStatus
  total_views: string
  chapter_count: string
  sales_total: string
  author: { username: string; display_name: string }
  primary_genre: { id: string; name: string }
  secondary_genre: { id: string; name: string } | null
  created_at: Date
  updated_at: Date
}

export interface WriterContentCount {
  total: string
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

export interface MyContentsResult {
  contents: WriterContent[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface CreateWriterContentInput {
  type: StoryType
  title: string
  alternative_title?: string
  slug?: string
  auto_generate_slug?: 'true'
  synopsis?: string
  status: StoryStatus
  age_rating: string
  primary_genre_id: string
  secondary_genre_id?: string
  cover?: File
}

export interface UpdateWriterContentInput extends Omit<CreateWriterContentInput, 'slug' | 'auto_generate_slug'> {
  slug: string
  remove_cover?: 'true'
}

export interface CreatedStory {
  id: string
  type: StoryType
  slug: string
  cover_url: string | null
  cover_blur_data_url: string | null
}
