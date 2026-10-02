import { Elysia } from 'elysia'
import { importChaptersBodySchema, importMangaChaptersBodySchema } from './chapter/writer-chapter.schema'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import {
  getWriterStatsResponse,
  getWriterContentsResponse,
  createWriterContentResponse,
  deleteWriterContentResponse,
  getWriterContentResponse,
  createWriterChapterResponse,
  getWriterChapterResponse,
  updateWriterChapterResponse,
  updateWriterContentResponse,
  getWriterChaptersResponse,
  bulkUpdateChapterPriceResponse,
  bulkUpdateChapterStatusResponse,
  importWriterChaptersResponse,
  importWriterMangaChaptersResponse,
} from './writer.controller'
import {
  createWriterContentBodySchema,
  updateWriterContentBodySchema,
  writerContentParamsSchema,
  writerContentsQuerySchema,
} from './content/writer-content.schema'
import {
  bulkUpdateChapterPriceBodySchema,
  bulkUpdateChapterStatusBodySchema,
  createWriterChapterBodySchema,
  updateWriterChapterBodySchema,
  writerChaptersQuerySchema,
  writerChapterParamsSchema,
  writerChaptersParamsSchema,
} from './chapter/writer-chapter.schema'
import { getWriterOverview } from './overview/writer-overview.controller'
import { writerOverviewQuerySchema } from './overview/writer-overview.schema'
import { getWriterPurchases } from './purchase/writer-purchase.controller'
import { writerPurchasesQuerySchema } from './purchase/writer-purchase.schema'
import { writerDashboardQuerySchema } from './writer.schema'

export const writerRoutes = new Elysia({ prefix: '/writer' })
  .use(authMiddleware)
  .post('/contents/:id/chapters/import-novels',
    ({ currentUser, params, body }) => importWriterChaptersResponse(currentUser, params.id, body),
    { auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN], params: writerChaptersParamsSchema, body: importChaptersBodySchema },
  )
  .post('/contents/:id/chapters/import-manga',
    ({ currentUser, params, body }) => importWriterMangaChaptersResponse(currentUser, params.id, body),
    { auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN], params: writerChaptersParamsSchema, body: importMangaChaptersBodySchema },
  )
  .get(
    '/purchases',
    ({ currentUser, query }) => getWriterPurchases(currentUser.id, query),
    {
      auth: USER_ROLE.WRITER,
      query: writerPurchasesQuerySchema,
    },
  )
  .get(
    '/contents/:id/overview',
    ({ currentUser, params, query }) => getWriterOverview(currentUser, params.id, query),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerContentParamsSchema,
      query: writerOverviewQuerySchema,
    },
  )
  .get(
    '/stats',
    ({ currentUser, query }) => getWriterStatsResponse(currentUser, query.period, query.content_id),
    { auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN], query: writerDashboardQuerySchema },
  )
  .get(
    '/contents',
    ({ currentUser, query }) => getWriterContentsResponse(currentUser, query),
    {
      optionalAuth: true,
      query: writerContentsQuerySchema,
    },
  )
  .post(
    '/contents',
    ({ currentUser, body }) => createWriterContentResponse(currentUser.id, body),
    {
      auth: USER_ROLE.WRITER,
      body: createWriterContentBodySchema,
    },
  )
  .get(
    '/contents/:id',
    ({ currentUser, params }) => getWriterContentResponse(currentUser, params.id),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerContentParamsSchema,
    },
  )
  .delete(
    '/contents/:id',
    ({ currentUser, params }) => deleteWriterContentResponse(currentUser.id, params.id),
    {
      auth: USER_ROLE.WRITER,
      params: writerContentParamsSchema,
    },
  )
  .post(
    '/contents/:id/chapters',
    ({ currentUser, params, body }) => createWriterChapterResponse(currentUser, params.id, body),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerChaptersParamsSchema,
      body: createWriterChapterBodySchema,
    },
  )
  .get(
    '/contents/:id/chapters/:chapterId',
    ({ currentUser, params }) => getWriterChapterResponse(currentUser, params.id, params.chapterId),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerChapterParamsSchema,
    },
  )
  .patch(
    '/contents/:id/chapters/:chapterId',
    ({ currentUser, params, body }) => updateWriterChapterResponse(
      currentUser,
      params.id,
      params.chapterId,
      body,
    ),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerChapterParamsSchema,
      body: updateWriterChapterBodySchema,
    },
  )
  .patch(
    '/contents/:id',
    ({ currentUser, params, body }) => updateWriterContentResponse(currentUser, params.id, body),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerContentParamsSchema,
      body: updateWriterContentBodySchema,
    },
  )
  .get(
    '/contents/:id/chapters',
    ({ currentUser, params, query }) => getWriterChaptersResponse(currentUser, params.id, query),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerChaptersParamsSchema,
      query: writerChaptersQuerySchema,
    },
  )
  .patch(
    '/contents/:id/chapters/bulk-price',
    ({ currentUser, params, body }) => bulkUpdateChapterPriceResponse(currentUser, params.id, body),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerChaptersParamsSchema,
      body: bulkUpdateChapterPriceBodySchema,
    },
  )
  .patch(
    '/contents/:id/chapters/bulk-status',
    ({ currentUser, params, body }) => bulkUpdateChapterStatusResponse(currentUser, params.id, body),
    {
      auth: [USER_ROLE.WRITER, USER_ROLE.SUPER_ADMIN],
      params: writerChaptersParamsSchema,
      body: bulkUpdateChapterStatusBodySchema,
    },
  )
