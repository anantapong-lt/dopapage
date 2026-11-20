import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import { changeAdminWriterStatus, editAdminWriter, getAdminWriters } from './admin-writers.controller'
import {
  adminWriterParamsSchema,
  adminWriterStatusBodySchema,
  adminWritersQuerySchema,
  updateAdminWriterBodySchema,
} from './admin-writers.schema'

export const adminWritersRoutes = new Elysia({ prefix: '/admin/writers' })
  .use(authMiddleware)
  .get('/', ({ query }) => getAdminWriters(query), {
    auth: USER_ROLE.SUPER_ADMIN,
    query: adminWritersQuerySchema,
  })
  .put('/:id/status', ({ params, body }) => changeAdminWriterStatus(params.id, body), {
    auth: USER_ROLE.SUPER_ADMIN,
    params: adminWriterParamsSchema,
    body: adminWriterStatusBodySchema,
  })
  .put('/:id', ({ params, body }) => editAdminWriter(params.id, body), {
    auth: USER_ROLE.SUPER_ADMIN,
    params: adminWriterParamsSchema,
    body: updateAdminWriterBodySchema,
  })
