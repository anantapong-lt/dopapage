import { status } from 'elysia'
import type { adminCoinLedgerQuerySchema } from './admin-coin-ledger.schema'
import { countAdminCoinLedger, findAdminCoinLedger } from './admin-coin-ledger.service'

export async function getAdminCoinLedger(query: typeof adminCoinLedgerQuerySchema.static) {
  const dateFrom = query.date_from ?? null
  const dateTo = query.date_to ?? null

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return status(400, { message: 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด' })
  }

  try {
    const limit = query.limit ?? 20
    const filters = {
      search: query.search?.trim() ?? '',
      type: !query.type || query.type === 'all' ? null : query.type,
      dateFrom,
      dateTo,
    }
    const total = await countAdminCoinLedger(filters)
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const page = Math.min(query.page ?? 1, totalPages)
    const entries = await findAdminCoinLedger(page, limit, filters)

    return { entries, pagination: { page, limit, total, totalPages } }
  } catch (error) {
    console.error('Unable to load admin coin ledger', error)
    return status(500, { message: 'ไม่สามารถโหลดประวัติยอดคงเหลือได้' })
  }
}
