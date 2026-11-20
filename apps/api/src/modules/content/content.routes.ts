import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import {
  favoritePublicContent,
  createChapterComment,
  deleteChapterComment,
  editChapterComment,
  getChapterComments,
  getPublicChapter,
  getPublicMangaChapterPages,
  getPublicContent,
  getPublicContentChapters,
  getPublicContentSitemap,
  normalizeContentSlug,
  ratePublicContent,
  removeChapterCommentReaction,
  setChapterCommentReaction,
  unfavoritePublicContent,
} from './content.controller'
import {
  contentChapterParamsSchema,
  chapterCommentBodySchema,
  chapterCommentEditBodySchema,
  chapterCommentsQuerySchema,
  chapterCommentParamsSchema,
  chapterCommentReactionBodySchema,
  contentChaptersQuerySchema,
  contentReaderPagesQuerySchema,
  contentParamsSchema,
  contentRatingBodySchema,
} from './content.schema'

export const contentRoutes = new Elysia({ prefix: '/contents' })
  .use(authMiddleware)
  .onTransform(normalizeContentSlug)
  .get('', () => getPublicContentSitemap())
  .post(
    '/:slug/favorite',
    ({ currentUser, params }) => favoritePublicContent(params.slug, currentUser.id),
    { auth: true, params: contentParamsSchema },
  )
  .get(
    '/:slug/chapters/:chapterNumber/comments',
    ({ currentUser, params, query }) => getChapterComments(
      params.slug,
      params.chapterNumber,
      currentUser?.id ?? null,
      query.page ?? 1,
      query.limit ?? 10,
      currentUser?.role === USER_ROLE.SUPER_ADMIN,
    ),
    {
      optionalAuth: true,
      params: contentChapterParamsSchema,
      query: chapterCommentsQuerySchema,
    },
  )
  .post(
    '/:slug/chapters/:chapterNumber/comments',
    ({ body, currentUser, params }) => createChapterComment(
      params.slug,
      params.chapterNumber,
      currentUser.id,
      body.body,
      body.parent_comment_id,
    ),
    { auth: true, params: contentChapterParamsSchema, body: chapterCommentBodySchema },
  )
  .patch(
    '/:slug/chapters/:chapterNumber/comments/:commentId',
    ({ body, currentUser, params }) => editChapterComment(
      params.slug,
      params.chapterNumber,
      params.commentId,
      currentUser.id,
      body.body,
    ),
    { auth: true, params: chapterCommentParamsSchema, body: chapterCommentEditBodySchema },
  )
  .delete(
    '/:slug/chapters/:chapterNumber/comments/:commentId',
    ({ currentUser, params }) => deleteChapterComment(
      params.slug,
      params.chapterNumber,
      params.commentId,
      currentUser.id,
    ),
    { auth: true, params: chapterCommentParamsSchema },
  )
  .put(
    '/:slug/chapters/:chapterNumber/comments/:commentId/reaction',
    ({ body, currentUser, params }) => setChapterCommentReaction(
      params.slug,
      params.chapterNumber,
      params.commentId,
      currentUser.id,
      body.reaction,
    ),
    { auth: true, params: chapterCommentParamsSchema, body: chapterCommentReactionBodySchema },
  )
  .delete(
    '/:slug/chapters/:chapterNumber/comments/:commentId/reaction',
    ({ currentUser, params }) => removeChapterCommentReaction(
      params.slug,
      params.chapterNumber,
      params.commentId,
      currentUser.id,
    ),
    { auth: true, params: chapterCommentParamsSchema },
  )
  .delete(
    '/:slug/favorite',
    ({ currentUser, params }) => unfavoritePublicContent(params.slug, currentUser.id),
    { auth: true, params: contentParamsSchema },
  )
  .post(
    '/:slug/rating',
    ({ body, currentUser, params }) => ratePublicContent(
      params.slug,
      currentUser.id,
      body.rating,
    ),
    { auth: true, params: contentParamsSchema, body: contentRatingBodySchema },
  )
  .get(
    '/:slug/chapters',
    ({ currentUser, params, query }) => getPublicContentChapters(
      params.slug,
      query.page,
      query.limit,
      query.sort,
      currentUser?.id ?? null,
      currentUser?.role === USER_ROLE.SUPER_ADMIN,
    ),
    {
      optionalAuth: true,
      params: contentParamsSchema,
      query: contentChaptersQuerySchema,
    },
  )
  .get(
    '/:slug/chapters/:chapterNumber/read/pages',
    ({ currentUser, params, query }) => getPublicMangaChapterPages(
      params.slug,
      params.chapterNumber,
      currentUser?.id ?? null,
      query.page ?? 1,
      query.limit ?? 5,
      currentUser?.role === USER_ROLE.SUPER_ADMIN,
    ),
    {
      optionalAuth: true,
      params: contentChapterParamsSchema,
      query: contentReaderPagesQuerySchema,
    },
  )
  .get(
    '/:slug/chapters/:chapterNumber/read',
    ({ currentUser, params, query }) => getPublicChapter(
      params.slug,
      params.chapterNumber,
      currentUser?.id ?? null,
      query.page ?? 1,
      query.limit ?? 5,
      currentUser?.role === USER_ROLE.SUPER_ADMIN,
    ),
    {
      optionalAuth: true,
      params: contentChapterParamsSchema,
      query: contentReaderPagesQuerySchema,
    },
  )
  .get(
    '/:slug',
    ({ currentUser, params }) => getPublicContent(
      params.slug,
      currentUser?.id ?? null,
      currentUser?.role === USER_ROLE.SUPER_ADMIN,
    ),
    { optionalAuth: true, params: contentParamsSchema },
  )
