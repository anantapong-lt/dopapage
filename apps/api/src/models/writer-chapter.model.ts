import type { ChapterStatus, StoryType } from './story.model'

export interface CreateWriterChapterInput {
  title: string
  chapter_number: number
  price?: number
  status: ChapterStatus
  published_at?: string
  content?: string
  images?: File[]
}

export interface UpdateWriterChapterInput extends CreateWriterChapterInput {
  retained_page_ids?: string[]
}

export interface CreatedWriterChapter {
  id: string
  story_id: string
  story_type: StoryType
  chapter_number: string
  title: string
  price: string
  is_free: boolean
  status: ChapterStatus
  published_at: Date | null
  created_at: Date
}

export interface WriterChapterPage {
  id: string
  image_key: string
  page_number: number
  width: number | null
  height: number | null
}

export interface WriterChapterDetail extends Omit<CreatedWriterChapter, 'created_at'> {
  content: string | null
  pages: WriterChapterPage[]
}

export interface GetWriterChaptersInput {
  search?: string
  page: number
  limit: number
}

export interface WriterChapter {
  id: string
  story_slug: string
  chapter_number: string
  title: string
  price: string
  is_free: boolean
  sales_count: string
  status: ChapterStatus
  published_at: Date | null
  created_at: Date
}

export interface WriterChapterCount {
  total: string
}

export interface WriterChaptersResult {
  chapters: WriterChapter[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface BulkUpdateChapterPriceInput {
  chapter_ids: string[]
  price: number
}

export interface BulkUpdateChapterStatusInput {
  chapter_ids: string[]
  status: ChapterStatus
  published_at?: string
}
