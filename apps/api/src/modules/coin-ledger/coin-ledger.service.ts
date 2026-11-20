import type { SQL } from 'bun'

export const COIN_LEDGER_TYPE = {
  TOPUP: 'topup',
  PURCHASE: 'purchase',
  SALE: 'sale',
  WITHDRAWAL_REQUEST: 'withdrawal_request',
  WITHDRAWAL_REFUND: 'withdrawal_refund',
  ADMIN_ADJUSTMENT: 'admin_adjustment',
} as const

export const COIN_LEDGER_TYPES = Object.values(COIN_LEDGER_TYPE)

export type CoinLedgerType = (typeof COIN_LEDGER_TYPE)[keyof typeof COIN_LEDGER_TYPE]

export interface CoinLedgerEntry {
  userId: string
  entryType: CoinLedgerType
  /** Signed change applied to the balance (negative for debits). */
  amount: string | number
  /** Balance of the user right after the change was applied. */
  balanceAfter: string
  referenceType?: string | null
  referenceId?: string | null
  actorUserId?: string | null
  note?: string | null
}

/**
 * Appends a coin ledger row. Call it with the same transaction that changed
 * users.balance so the ledger and balance can never drift apart.
 */
export async function recordCoinLedger(sql: SQL, entry: CoinLedgerEntry) {
  await sql`
    INSERT INTO coin_ledger (
      user_id, entry_type, amount, balance_before, balance_after,
      reference_type, reference_id, actor_user_id, note
    ) VALUES (
      ${entry.userId},
      ${entry.entryType},
      ROUND(${String(entry.amount)}::NUMERIC, 2),
      ROUND(${entry.balanceAfter}::NUMERIC - ${String(entry.amount)}::NUMERIC, 2),
      ROUND(${entry.balanceAfter}::NUMERIC, 2),
      ${entry.referenceType ?? null},
      ${entry.referenceId ?? null},
      ${entry.actorUserId ?? null},
      ${entry.note ?? null}
    )
  `
}
