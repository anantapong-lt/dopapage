export type ChapterStatus = 'draft' | 'scheduled' | 'published' | 'hidden'

export interface CreatedWriterChapter {
  id: string
  story_id: string
  story_type: 'novel' | 'manga'
  chapter_number: string
  title: string
  price: string
  is_free: boolean
  status: ChapterStatus
  published_at: string | null
  created_at: string
}

export interface WriterChapterPage {
  id: string
  image_url: string
  page_number: number
  width: number | null
  height: number | null
}

export interface WriterChapterDetail extends Omit<CreatedWriterChapter, 'created_at'> {
  content: string | null
  pages: WriterChapterPage[]
}

export interface WriterChapter {
  id: string
  story_slug: string
  chapter_number: string
  title: string
  price: string
  is_free: boolean
  sales_amount: string
  status: ChapterStatus
  published_at: string | null
  created_at: string
}

export interface WriterChaptersResponse {
  chapters: WriterChapter[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
