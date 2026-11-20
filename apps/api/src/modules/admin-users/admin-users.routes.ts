import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import { editAdminUser, getAdminUsers } from './admin-users.controller'
import { adminUserParamsSchema, adminUsersQuerySchema, updateAdminUserBodySchema } from './admin-users.schema'

export const adminUsersRoutes = new Elysia({ prefix: '/admin/users' })
  .use(authMiddleware)
  .get('/', ({ query }) => getAdminUsers(query), {
    auth: USER_ROLE.SUPER_ADMIN,
    query: adminUsersQuerySchema,
  })
  .put('/:id', ({ params, body, currentUser }) => editAdminUser(params.id, currentUser.id, body), {
    auth: USER_ROLE.SUPER_ADMIN,
    params: adminUserParamsSchema,
    body: updateAdminUserBodySchema,
  })
