import type { StoryType } from '@/constants/story.constant'

export type LandingSection = 'random' | 'latest' | 'popular' | 'weekly' | 'all-time' | 'most-followed'

export interface LandingStory {
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
  created_at: string
  latest_chapter: {
    id: string
    chapter_number: string
    title: string
    published_at: string
  } | null
}

export interface LandingResponse {
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
