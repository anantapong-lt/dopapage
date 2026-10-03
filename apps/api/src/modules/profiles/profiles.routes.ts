import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { getMyFavoriteStoriesResponse, getMyProfileResponse, getPublicProfileResponse, getRandomWriterProfilesResponse, getReadingSettingsResponse, updateMyProfileAvatarResponse, updateMyProfileCoverResponse, updateMyProfileResponse, updateReadingSettingsResponse } from './profiles.controller'
import { favoriteStoriesQuerySchema, profileStoriesQuerySchema, profileUsernameParamsSchema, randomProfilesQuerySchema, readingSettingsSchema, updateMyProfileAvatarBodySchema, updateMyProfileBodySchema, updateMyProfileCoverBodySchema } from './profiles.schema'

export const profilesRoutes = new Elysia({ prefix: '/profiles' })
  .use(authMiddleware)
  .get('/me', ({ currentUser }) => getMyProfileResponse(currentUser.id), { auth: true })
  .get('/me/reading-settings', ({ currentUser }) => getReadingSettingsResponse(currentUser.id), { auth: true })
  .put('/me/reading-settings', ({ currentUser, body }) => updateReadingSettingsResponse(currentUser.id, body), {
    auth: true,
    body: readingSettingsSchema,
  })
  .get('/me/favorites', ({ currentUser, query }) => getMyFavoriteStoriesResponse(currentUser?.id, query.type, query.page, query.limit), {
    optionalAuth: true,
    query: favoriteStoriesQuerySchema,
  })
  .patch('/me', ({ currentUser, body }) => updateMyProfileResponse(currentUser.id, body), {
    auth: true,
    body: updateMyProfileBodySchema,
  })
  .post('/me/cover', ({ currentUser, body }) => updateMyProfileCoverResponse(currentUser.id, body.cover), {
    auth: true,
    body: updateMyProfileCoverBodySchema,
  })
  .post('/me/avatar', ({ currentUser, body }) => updateMyProfileAvatarResponse(currentUser.id, body.avatar), {
    auth: true,
    body: updateMyProfileAvatarBodySchema,
  })
  .get('/random', ({ query }) => getRandomWriterProfilesResponse(query.limit), {
    query: randomProfilesQuerySchema,
  })
  .get('/:username', ({ params, query }) => getPublicProfileResponse(params.username, query.type, query.page, query.limit), {
    params: profileUsernameParamsSchema,
    query: profileStoriesQuerySchema,
  })
