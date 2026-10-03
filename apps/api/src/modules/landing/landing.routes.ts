import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { getLanding } from './landing.controller'
import { landingQuerySchema } from './landing.schema'

export const landingRoutes = new Elysia({ prefix: '/landing' })
  .use(authMiddleware)
  .get(
  '',
  ({ query, currentUser }) => getLanding(query, currentUser?.id ?? null),
  { query: landingQuerySchema, optionalAuth: true },
)
