import { t } from 'elysia'
import { COIN_LEDGER_TYPES } from '../coin-ledger/coin-ledger.service'

const dateSchema = t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })

export const adminCoinLedgerQuerySchema = t.Object({
  search: t.Optional(t.String({ maxLength: 255 })),
  type: t.Optional(t.Union([t.Literal('all'), t.UnionEnum(COIN_LEDGER_TYPES)])),
  date_from: t.Optional(dateSchema),
  date_to: t.Optional(dateSchema),
  page: t.Optional(t.Numeric({ minimum: 1, maximum: 2_147_483_647, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
})
