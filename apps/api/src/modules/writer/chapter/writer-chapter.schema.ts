import { t } from 'elysia'
import { CHAPTER_STATUSES } from '../../../models/story.model'

export const importChaptersBodySchema = t.Object({
  chapters: t.Array(t.Object({
    title: t.String({ maxLength: 255 }),
    chapter_number: t.String({ maxLength: 30 }),
    price: t.String({ maxLength: 30 }),
    status: t.UnionEnum(CHAPTER_STATUSES),
    published_at: t.Optional(t.String({ maxLength: 40 })),
    content: t.String(),
  }), { minItems: 1, maxItems: 500 }),
})

export const importMangaChaptersBodySchema = t.Object({
  chapters: t.Array(t.Object({
    title: t.String({ maxLength: 255 }),
    chapter_number: t.String({ maxLength: 30 }),
    price: t.String({ maxLength: 30 }),
    status: t.UnionEnum(CHAPTER_STATUSES),
    page_count: t.Number({ minimum: 1, maximum: 200, multipleOf: 1 }),
    published_at: t.Optional(t.String({ maxLength: 40 })),
  }), { minItems: 1, maxItems: 500 }),
  images: t.Files({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: '10m',
    maxItems: 5_000,
  }),
})

export const writerChapterParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  chapterId: t.String({ format: 'uuid' }),
})

export const writerChaptersParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }),
})

export const createWriterChapterBodySchema = t.Object({
  title: t.String({ maxLength: 255 }),
  chapter_number: t.Numeric({ minimum: 0, maximum: 99_999_999.9 }),
  price: t.Optional(t.Numeric({ minimum: 0, maximum: 9_999_999_999.99 })),
  status: t.UnionEnum(CHAPTER_STATUSES),
  published_at: t.Optional(t.String({ format: 'date-time' })),
  content: t.Optional(t.String()),
  images: t.Optional(t.Files({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: '10m',
    maxItems: 200,
  })),
})

export const updateWriterChapterBodySchema = t.Object({
  ...createWriterChapterBodySchema.properties,
  retained_page_ids: t.Optional(t.Array(t.String({ format: 'uuid' }), { maxItems: 200 })),
})

export const writerChaptersQuerySchema = t.Object({
  search: t.Optional(t.String({ maxLength: 255 })),
  sort: t.Optional(t.UnionEnum(['chapter_desc', 'chapter_asc', 'sales_desc', 'sales_asc', 'created_desc', 'created_asc'])),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
})

export const bulkUpdateChapterPriceBodySchema = t.Object({
  chapter_ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1 }),
  price: t.Number({ minimum: 0, maximum: 9_999_999_999.99 }),
})

export const bulkUpdateChapterStatusBodySchema = t.Object({
  chapter_ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1 }),
  status: t.UnionEnum(CHAPTER_STATUSES),
  published_at: t.Optional(t.String({ format: 'date-time' })),
})
