import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import { loadSystemLogs, loadSystemMetrics } from './admin-system.controller'
import { adminSystemLogsQuerySchema } from './admin-system.schema'

export const adminSystemRoutes = new Elysia({ prefix: '/admin/system' })
  .use(authMiddleware)
  .get('/metrics', () => loadSystemMetrics(), { auth: USER_ROLE.SUPER_ADMIN })
  .get('/logs', ({ query }) => loadSystemLogs(query), { auth: USER_ROLE.SUPER_ADMIN, query: adminSystemLogsQuerySchema })
