import { db } from '../../db'
import type { CoinLedgerType } from '../coin-ledger/coin-ledger.service'

export interface AdminCoinLedgerFilters {
  search: string
  type: CoinLedgerType | null
  dateFrom: string | null
  dateTo: string | null
}

export interface AdminCoinLedgerEntry {
  id: string
  entry_type: CoinLedgerType
  amount: string
  balance_before: string
  balance_after: string
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_at: Date
  user_display_name: string
  user_username: string
  user_email: string
  actor_display_name: string | null
  actor_username: string | null
}

export async function countAdminCoinLedger(filters: AdminCoinLedgerFilters) {
  const [row] = await db<{ total: string }[]>`
    SELECT COUNT(*)::TEXT AS total
    FROM coin_ledger
    JOIN users ON users.id = coin_ledger.user_id
    WHERE (${filters.type}::TEXT IS NULL OR coin_ledger.entry_type = ${filters.type})
      AND (
        ${filters.search} = ''
        OR STRPOS(LOWER(users.display_name), LOWER(${filters.search})) > 0
        OR STRPOS(LOWER(users.username), LOWER(${filters.search})) > 0
        OR STRPOS(LOWER(users.email), LOWER(${filters.search})) > 0
      )
      AND (
        ${filters.dateFrom}::DATE IS NULL
        OR coin_ledger.created_at >= (${filters.dateFrom}::DATE::TIMESTAMP AT TIME ZONE 'Asia/Bangkok')
      )
      AND (
        ${filters.dateTo}::DATE IS NULL
        OR coin_ledger.created_at < (((${filters.dateTo}::DATE + 1)::TIMESTAMP) AT TIME ZONE 'Asia/Bangkok')
      )
  `
  return Number(row?.total ?? 0)
}

export function findAdminCoinLedger(page: number, limit: number, filters: AdminCoinLedgerFilters) {
  return db<AdminCoinLedgerEntry[]>`
    SELECT
      coin_ledger.id,
      coin_ledger.entry_type,
      coin_ledger.amount::TEXT,
      coin_ledger.balance_before::TEXT,
      coin_ledger.balance_after::TEXT,
      coin_ledger.reference_type,
      coin_ledger.reference_id,
      coin_ledger.note,
      coin_ledger.created_at,
      users.display_name AS user_display_name,
      users.username AS user_username,
      users.email AS user_email,
      actor.display_name AS actor_display_name,
      actor.username AS actor_username
    FROM coin_ledger
    JOIN users ON users.id = coin_ledger.user_id
    LEFT JOIN users AS actor ON actor.id = coin_ledger.actor_user_id
    WHERE (${filters.type}::TEXT IS NULL OR coin_ledger.entry_type = ${filters.type})
      AND (
        ${filters.search} = ''
        OR STRPOS(LOWER(users.display_name), LOWER(${filters.search})) > 0
        OR STRPOS(LOWER(users.username), LOWER(${filters.search})) > 0
        OR STRPOS(LOWER(users.email), LOWER(${filters.search})) > 0
      )
      AND (
        ${filters.dateFrom}::DATE IS NULL
        OR coin_ledger.created_at >= (${filters.dateFrom}::DATE::TIMESTAMP AT TIME ZONE 'Asia/Bangkok')
      )
      AND (
        ${filters.dateTo}::DATE IS NULL
        OR coin_ledger.created_at < (((${filters.dateTo}::DATE + 1)::TIMESTAMP) AT TIME ZONE 'Asia/Bangkok')
      )
    ORDER BY coin_ledger.created_at DESC, coin_ledger.id DESC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `
}
