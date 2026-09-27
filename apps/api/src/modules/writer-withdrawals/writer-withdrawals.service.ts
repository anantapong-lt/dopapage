import { db } from '../../db'
import { NOTIFICATION_TYPE } from '../../models/notification.model'
import { USER_ROLE, USER_STATUS } from '../../models/user.model'
import { WITHDRAWAL_STATUS, type WithdrawalStatus } from '../../models/withdrawal.model'
import type { WriterBankAccount } from '../writer-bank-account/writer-bank-account.service'

interface WithdrawalConfig {
  commission_percent: string
}

interface FeatureConfig {
  withdrawals: boolean
}

interface WriterAccountRow {
  balance: string
  display_name: string
  status: string
  deleted_at: Date | null
}

interface WriterWithdrawalRow {
  id: string
  requested_amount: string
  commission_percent: string
  commission_amount: string
  net_amount: string
  bank_code: string
  account_number: string
  requested_at: Date
  status: WithdrawalStatus
  approval_note: string | null
  rejection_reason: string | null
  approved_at: Date | null
  paid_at: Date | null
  rejected_at: Date | null
}

export class WriterWithdrawalError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409) {
    super(message)
    this.name = 'WriterWithdrawalError'
  }
}

function withdrawalConfig(value: unknown): WithdrawalConfig {
  if (!value || typeof value !== 'object') throw new Error('Withdrawal configuration is incomplete')
  const commissionPercent = (value as { commission_percent?: unknown }).commission_percent
  if (typeof commissionPercent !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(commissionPercent) || Number(commissionPercent) > 100) {
    throw new Error('Withdrawal commission configuration is invalid')
  }
  return { commission_percent: commissionPercent }
}

function featureConfig(value: unknown): FeatureConfig {
  if (!value || typeof value !== 'object' || typeof (value as { withdrawals?: unknown }).withdrawals !== 'boolean') {
    throw new Error('Feature configuration is incomplete')
  }
  return { withdrawals: (value as { withdrawals: boolean }).withdrawals }
}

async function getWithdrawalSettings() {
  const rows = await db<{ key: 'withdrawal' | 'features'; value: unknown }[]>`
    SELECT key, value
    FROM website_configs
    WHERE key IN ('withdrawal', 'features')
  `
  const values = new Map(rows.map((row) => [row.key, row.value]))
  return {
    withdrawal: withdrawalConfig(values.get('withdrawal')),
    features: featureConfig(values.get('features')),
  }
}

function mapRequest(row: WriterWithdrawalRow) {
  return {
    id: row.id,
    requested_amount: row.requested_amount,
    commission_percent: row.commission_percent,
    commission_amount: row.commission_amount,
    net_amount: row.net_amount,
    bank_code: row.bank_code,
    account_number: row.account_number,
    requested_at: row.requested_at,
    status: row.status,
    note: row.status === WITHDRAWAL_STATUS.REJECTED ? row.rejection_reason : row.approval_note,
    approved_at: row.approved_at,
    paid_at: row.paid_at,
    rejected_at: row.rejected_at,
  }
}

const requestSelect = `id, requested_amount::TEXT, commission_percent::TEXT, commission_amount::TEXT, net_amount::TEXT, bank_code, account_number, requested_at, status, approval_note, rejection_reason, approved_at, paid_at, rejected_at`

export async function getWriterWithdrawals(userId: string, page: number, limit: number) {
  const [{ withdrawal, features }, [account], [writer], [sales], requests, [count]] = await Promise.all([
    getWithdrawalSettings(),
    db<WriterBankAccount[]>`
      SELECT id, account_holder_first_name, account_holder_last_name, bank_code,
        account_number, application_status, status
      FROM writer_bank_accounts
      WHERE writer_user_id = ${userId} AND status = 'active'
      LIMIT 1
    `,
    db<{ balance: string }[]>`SELECT balance::TEXT FROM users WHERE id = ${userId}`,
    db<{ total_sales: string }[]>`
      SELECT ROUND(COALESCE(SUM(price), 0), 2)::TEXT AS total_sales
      FROM chapter_purchases
      WHERE writer_user_id = ${userId}
    `,
    db<WriterWithdrawalRow[]>`
      SELECT ${db.unsafe(requestSelect)}
      FROM withdrawal_requests
      WHERE writer_user_id = ${userId}
      ORDER BY requested_at DESC, id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `,
    db<{ total: string }[]>`SELECT COUNT(*)::TEXT AS total FROM withdrawal_requests WHERE writer_user_id = ${userId}`,
  ])

  return {
    balance: writer?.balance ?? '0.00',
    total_sales: sales?.total_sales ?? '0.00',
    commission_percent: withdrawal.commission_percent,
    withdrawals_enabled: features.withdrawals,
    bank_account: account ?? null,
    requests: requests.map(mapRequest),
    pagination: {
      page,
      limit,
      total: Number(count?.total ?? 0),
      total_pages: Math.max(1, Math.ceil(Number(count?.total ?? 0) / limit)),
    },
  }
}

export async function createWriterWithdrawal(userId: string, amount: string) {
  const { withdrawal, features } = await getWithdrawalSettings()
  if (!features.withdrawals) throw new WriterWithdrawalError('ระบบถอนเงินยังไม่เปิดใช้งาน', 403)
  if (Number(amount) <= 0) throw new WriterWithdrawalError('กรุณาระบุจำนวนเงินที่มากกว่า 0', 400)

  return db.begin(async (transaction) => {
    const [bankAccount] = await transaction<WriterBankAccount[]>`
      SELECT id, account_holder_first_name, account_holder_last_name, bank_code,
        account_number, application_status, status
      FROM writer_bank_accounts
      WHERE writer_user_id = ${userId} AND status = 'active'
      FOR UPDATE
    `
    if (!bankAccount) throw new WriterWithdrawalError('กรุณาตั้งค่าบัญชีธนาคารก่อนถอนเงิน', 400)
    if (bankAccount.application_status !== 'approve') throw new WriterWithdrawalError('บัญชีธนาคารของคุณยังไม่ได้รับการอนุมัติ', 403)

    const [writer] = await transaction<WriterAccountRow[]>`
      SELECT balance::TEXT, display_name, status, deleted_at
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `
    if (!writer || writer.status !== 'active' || writer.deleted_at) throw new WriterWithdrawalError('ไม่พบบัญชีนักเขียนที่พร้อมใช้งาน', 404)
    if (Number(writer.balance) < Number(amount)) throw new WriterWithdrawalError('ยอดที่ถอนมากกว่ายอดคงเหลือ', 400)

    const [request] = await transaction<WriterWithdrawalRow[]>`
      WITH amounts AS (
        SELECT
          ROUND(${amount}::NUMERIC, 2) AS requested_amount,
          ROUND(${withdrawal.commission_percent}::NUMERIC, 2) AS commission_percent
      ), calculated AS (
        SELECT
          requested_amount,
          commission_percent,
          ROUND(requested_amount * commission_percent / 100, 2) AS commission_amount
        FROM amounts
      )
      INSERT INTO withdrawal_requests (
        writer_user_id, account_holder_first_name, account_holder_last_name,
        bank_code, account_number, requested_amount, commission_percent,
        commission_amount, net_amount
      )
      SELECT
        ${userId}, ${bankAccount.account_holder_first_name}, ${bankAccount.account_holder_last_name},
        ${bankAccount.bank_code}, ${bankAccount.account_number}, requested_amount,
        commission_percent, commission_amount, requested_amount - commission_amount
      FROM calculated
      WHERE requested_amount - commission_amount > 0
      RETURNING ${transaction.unsafe(requestSelect)}
    `
    if (!request) throw new WriterWithdrawalError('ยอดถอนหลังหักค่าคอมมิชชันต้องมากกว่า 0', 400)

    await transaction`
      UPDATE users
      SET balance = ROUND(balance - ${amount}::NUMERIC, 2), updated_at = NOW()
      WHERE id = ${userId}
    `
    await transaction`
      INSERT INTO withdrawal_request_events (
        withdrawal_request_id, from_status, to_status, actor_user_id
      ) VALUES (${request.id}, NULL, ${WITHDRAWAL_STATUS.PENDING}, ${userId})
    `
    await transaction`
      INSERT INTO notifications (user_id, type, title, message, target_url, data)
      SELECT
        id,
        ${NOTIFICATION_TYPE.WITHDRAWAL_REQUESTED},
        'มีคำขอถอนเงินใหม่',
        ${`นักเขียน ${writer.display_name} ส่งคำขอถอนเงินจำนวน ${request.requested_amount}`},
        '/transactions',
        ${JSON.stringify({ withdrawal_request_id: request.id, writer_user_id: userId, status: WITHDRAWAL_STATUS.PENDING })}::JSONB
      FROM users
      WHERE role = ${USER_ROLE.SUPER_ADMIN}
        AND status = ${USER_STATUS.ACTIVE}
        AND deleted_at IS NULL
    `
    const [updatedWriter] = await transaction<{ balance: string }[]>`
      SELECT balance::TEXT FROM users WHERE id = ${userId}
    `
    return { request: mapRequest(request), balance: updatedWriter?.balance ?? '0.00' }
  })
}
