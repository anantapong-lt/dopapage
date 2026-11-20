import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import { getAdminCoinLedger } from './admin-coin-ledger.controller'
import { adminCoinLedgerQuerySchema } from './admin-coin-ledger.schema'

export const adminCoinLedgerRoutes = new Elysia({ prefix: '/admin/coin-ledger' })
  .use(authMiddleware)
  .get('/', ({ query }) => getAdminCoinLedger(query), {
    auth: USER_ROLE.SUPER_ADMIN,
    query: adminCoinLedgerQuerySchema,
  })
