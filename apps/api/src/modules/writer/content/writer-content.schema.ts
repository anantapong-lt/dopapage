import { t } from 'elysia'
import { STORY_STATUSES, STORY_TYPES } from '../../../models/story.model'

export const writerContentParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }),
})

export const writerContentsQuerySchema = t.Object({
  tab: t.UnionEnum(['novel', 'cartoon']),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
  search: t.Optional(t.String({ maxLength: 120 })),
  genre_ids: t.Optional(t.String({ maxLength: 1100 })),
  // UnionEnum defaults to the first status; an omitted filter must mean all statuses.
  status: t.Optional(t.Union(STORY_STATUSES.map((value) => t.Literal(value)))),
})

export const createWriterContentBodySchema = t.Object({
  type: t.UnionEnum(STORY_TYPES),
  title: t.String({ minLength: 1, maxLength: 120 }),
  alternative_title: t.Optional(t.String({ maxLength: 120 })),
  slug: t.Optional(t.String({ maxLength: 255 })),
  auto_generate_slug: t.Optional(t.Literal('true')),
  synopsis: t.Optional(t.String({ maxLength: 140 })),
  status: t.UnionEnum(STORY_STATUSES),
  age_rating: t.UnionEnum(['0', '18']),
  primary_genre_id: t.String({ format: 'uuid' }),
  secondary_genre_id: t.Optional(t.String()),
  cover: t.Optional(t.File({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: '5m',
  })),
})

export const updateWriterContentBodySchema = t.Object({
  type: t.UnionEnum(STORY_TYPES),
  title: t.String({ minLength: 1, maxLength: 120 }),
  alternative_title: t.Optional(t.String({ maxLength: 120 })),
  slug: t.String({ minLength: 1, maxLength: 255 }),
  synopsis: t.Optional(t.String({ maxLength: 140 })),
  status: t.UnionEnum(STORY_STATUSES),
  age_rating: t.UnionEnum(['0', '18']),
  primary_genre_id: t.String({ format: 'uuid' }),
  secondary_genre_id: t.Optional(t.String()),
  cover: t.Optional(t.File({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: '5m',
  })),
  remove_cover: t.Optional(t.Literal('true')),
})
