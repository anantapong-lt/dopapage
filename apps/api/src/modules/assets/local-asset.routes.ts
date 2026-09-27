import { Elysia } from 'elysia'
import { privateLocalAssetResponse, publicLocalAssetResponse, uploadLocalTtsAssetResponse } from './local-asset.controller'
import { localAssetQuerySchema, signedLocalAssetQuerySchema } from './local-asset.schema'

export const localAssetRoutes = new Elysia()
  .get('/assets/local', ({ query }) => publicLocalAssetResponse(query.key), { query: localAssetQuerySchema })
  .get('/assets/private', ({ query }) => privateLocalAssetResponse(query.key, query.expires, query.signature), { query: signedLocalAssetQuerySchema })
  .put('/assets/tts-upload', ({ query, request }) => uploadLocalTtsAssetResponse(query.key, query.expires, query.signature, request), { query: signedLocalAssetQuerySchema })
