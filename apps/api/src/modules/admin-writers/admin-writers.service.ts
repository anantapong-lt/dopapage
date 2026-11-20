import { db } from '../../db'
import { USER_ROLE, USER_STATUS, WRITER_STATUS, type WriterStatus } from '../../models/user.model'
import { WITHDRAWAL_STATUS } from '../../models/withdrawal.model'
import { COIN_LEDGER_TYPE, recordCoinLedger } from '../coin-ledger/coin-ledger.service'

export interface AdminWriter {
  id: string
  display_name: string
  username: string
  email: string
  phone_number: string | null
  avatar_url: string | null
  status: WriterStatus
  balance: string
  created_at: Date
  last_login_at: Date | null
  content_count: string
  novel_count: string
  manga_count: string
  chapter_count: string
  total_views: string
  sales_count: string
  sales_total: string
  net_revenue: string
}

export async function countAdminWriters(search: string, status: WriterStatus | null) {
  const [row] = await db<{ total: string }[]>`
    SELECT COUNT(*)::TEXT AS total
    FROM users
    WHERE role = ${USER_ROLE.WRITER}
      AND deleted_at IS NULL
      AND (${status}::TEXT IS NULL OR users.writer_status = ${status}::moderation_status)
      AND (
        ${search} = ''
        OR STRPOS(LOWER(email), LOWER(${search})) > 0
        OR STRPOS(LOWER(username), LOWER(${search})) > 0
        OR STRPOS(LOWER(display_name), LOWER(${search})) > 0
      )
  `
  return Number(row?.total ?? 0)
}

export function findAdminWriters(page: number, limit: number, search: string, status: WriterStatus | null) {
  return db<AdminWriter[]>`
    SELECT
      users.id, users.display_name, users.username, users.email, users.phone_number, users.avatar_url,
      users.writer_status AS status, users.balance::TEXT, users.created_at, users.last_login_at,
      (
        SELECT COUNT(*)::TEXT
        FROM stories
        WHERE stories.creator_user_id = users.id AND stories.deleted_at IS NULL
      ) AS content_count,
      (
        SELECT COUNT(*)::TEXT
        FROM stories
        WHERE stories.creator_user_id = users.id AND stories.deleted_at IS NULL AND stories.type = 'novel'
      ) AS novel_count,
      (
        SELECT COUNT(*)::TEXT
        FROM stories
        WHERE stories.creator_user_id = users.id AND stories.deleted_at IS NULL AND stories.type = 'manga'
      ) AS manga_count,
      (
        SELECT COUNT(*)::TEXT
        FROM chapters
        INNER JOIN stories ON stories.id = chapters.story_id
        WHERE stories.creator_user_id = users.id AND stories.deleted_at IS NULL
      ) AS chapter_count,
      (
        SELECT COALESCE(SUM(stories.total_views), 0)::TEXT
        FROM stories
        WHERE stories.creator_user_id = users.id AND stories.deleted_at IS NULL
      ) AS total_views,
      (
        SELECT COUNT(*)::TEXT
        FROM chapter_purchases
        WHERE chapter_purchases.writer_user_id = users.id
      ) AS sales_count,
      (
        SELECT ROUND(COALESCE(SUM(chapter_purchases.price), 0), 2)::NUMERIC(12, 2)::TEXT
        FROM chapter_purchases
        WHERE chapter_purchases.writer_user_id = users.id
      ) AS sales_total,
      ROUND(
        (SELECT COALESCE(SUM(price), 0) FROM chapter_purchases WHERE writer_user_id = users.id)
        - (SELECT COALESCE(SUM(commission_amount), 0) FROM withdrawal_requests
           WHERE writer_user_id = users.id AND status = ${WITHDRAWAL_STATUS.PAID}),
        2
      )::TEXT AS net_revenue
    FROM users
    WHERE users.role = ${USER_ROLE.WRITER}
      AND users.deleted_at IS NULL
      AND (${status}::TEXT IS NULL OR users.writer_status = ${status}::moderation_status)
      AND (
        ${search} = ''
        OR STRPOS(LOWER(users.email), LOWER(${search})) > 0
        OR STRPOS(LOWER(users.username), LOWER(${search})) > 0
        OR STRPOS(LOWER(users.display_name), LOWER(${search})) > 0
      )
    ORDER BY users.created_at DESC, users.id DESC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `
}

export async function updateAdminWriterStatus(id: string, status: WriterStatus, banReason: string | null): Promise<{ id: string; status: WriterStatus } | null> {
  const [writer] = await db<Array<{ id: string; status: WriterStatus }>>`
    UPDATE users
    SET writer_status = ${status}::moderation_status,
        status = ${status === WRITER_STATUS.SUSPENDED ? USER_STATUS.BANNED : USER_STATUS.ACTIVE},
        ban_reason = ${status === WRITER_STATUS.SUSPENDED ? banReason : null},
        banned_at = ${status === WRITER_STATUS.SUSPENDED ? new Date().toISOString() : null},
        updated_at = NOW()
    WHERE id = ${id}
      AND role = ${USER_ROLE.WRITER}
      AND deleted_at IS NULL
    RETURNING id, writer_status AS status
  `
  return writer ?? null
}

export async function updateAdminWriter(
  id: string,
  actorUserId: string,
  input: { displayName: string; phoneNumber: string | null; balance: string },
): Promise<{ id: string; display_name: string; phone_number: string | null; balance: string } | null> {
  return db.begin(async (transaction) => {
    const [previous] = await transaction<{ balance: string }[]>`
      SELECT balance::TEXT AS balance
      FROM users
      WHERE id = ${id}
        AND role = ${USER_ROLE.WRITER}
        AND deleted_at IS NULL
      FOR UPDATE
    `
    if (!previous) return null

    const [writer] = await transaction<Array<{ id: string; display_name: string; phone_number: string | null; balance: string }>>`
      UPDATE users
      SET display_name = ${input.displayName},
          phone_number = ${input.phoneNumber},
          balance = ROUND(${input.balance}::NUMERIC, 2),
          updated_at = NOW()
      WHERE id = ${id}
        AND role = ${USER_ROLE.WRITER}
        AND deleted_at IS NULL
      RETURNING id, display_name, phone_number, balance::TEXT
    `
    if (!writer) return null

    const [change] = await transaction<{ amount: string }[]>`
      SELECT ROUND(${writer.balance}::NUMERIC - ${previous.balance}::NUMERIC, 2)::TEXT AS amount
    `
    if (change && Number(change.amount) !== 0) {
      await recordCoinLedger(transaction, {
        userId: id,
        entryType: COIN_LEDGER_TYPE.ADMIN_ADJUSTMENT,
        amount: change.amount,
        balanceAfter: writer.balance,
        referenceType: 'admin_edit',
        actorUserId,
      })
    }
    return writer
  })
}
