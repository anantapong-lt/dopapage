import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import { loadSystemMetrics } from './admin-system.controller'

export const adminSystemRoutes = new Elysia({ prefix: '/admin/system' })
  .use(authMiddleware)
  .get('/metrics', () => loadSystemMetrics(), { auth: USER_ROLE.SUPER_ADMIN })
