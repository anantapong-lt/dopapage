import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '../../db'
import { env, isDev } from '../../config/env'
import { publishTopupEvent } from './topup.events'
import { TopupStatus } from '../../models/topup.model'
import { getPublicTopupConfig } from '../admin-site/admin-site.service'
import { COIN_LEDGER_TYPE, recordCoinLedger } from '../coin-ledger/coin-ledger.service'

export interface TopupTransaction {
  id: string
  requested_amount: string
  base_coins: string
  bonus_coins: string
  credited_coins: string
  status: TopupStatus
  expires_at: Date | null
  paid_at: Date | null
  created_at: Date
}

export interface CreatedTopup {
  transaction: TopupTransaction
  payment: {
    provider_payment_id: string
    amount_check_satang: number
    qr_image_base64: string
    time_out: number
  }
}

export interface TopupHistory {
  transactions: TopupTransaction[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

type TopupErrorStatus = 400 | 401 | 403 | 404 | 409 | 502

export class TopupError extends Error {
  constructor(
    message: string,
    readonly statusCode: TopupErrorStatus,
    readonly providerDetails?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'TopupError'
  }
}

interface ProviderResponse {
  status?: number | string
  id_pay?: number | string
  ref1?: number | string
  amount_check?: number | string
  qr_image_base64?: string
  time_out?: number | string
  msg?: string
}

interface TmweasyWebhookPayload {
  id_pay: string
  ref1: string
  amount_check: string
  amount: string
  date_pay?: string
}

interface LockedTopup {
  user_id: string
  provider_payment_id: string | null
  requested_amount: string
  amount_check_satang: string | null
  credited_coins: string
  status: TopupStatus
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SATANG_PATTERN = /^\d+$/
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/

function providerSucceeded(response: ProviderResponse): boolean {
  return String(response.status) === '1'
}

function webhookValue(
  payload: Record<string, unknown>,
  field: keyof TmweasyWebhookPayload,
): string {
  const value = payload[field]
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

function parseTmweasyWebhookPayload(data: string): TmweasyWebhookPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    throw new TopupError('ข้อมูล Webhook ไม่ถูกต้อง', 400)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TopupError('ข้อมูล Webhook ไม่ถูกต้อง', 400)
  }

  const payload = parsed as Record<string, unknown>
  const idPay = webhookValue(payload, 'id_pay')
  const ref1 = webhookValue(payload, 'ref1')
  const amountCheck = webhookValue(payload, 'amount_check')
  const amount = webhookValue(payload, 'amount')
  const datePay = webhookValue(payload, 'date_pay')

  if (
    !idPay
    || idPay.length > 100
    || !ref1
    || ref1.length > 100
    || !SATANG_PATTERN.test(amountCheck)
    || BigInt(amountCheck) <= 0n
    || !MONEY_PATTERN.test(amount)
    || moneyToSatang(amount) <= 0n
  ) {
    throw new TopupError('ข้อมูล Webhook ไม่ถูกต้อง', 400)
  }

  return {
    id_pay: idPay,
    ref1,
    amount_check: amountCheck,
    amount,
    ...(datePay ? { date_pay: datePay.slice(0, 100) } : {}),
  }
}

function moneyToSatang(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) {
    throw new TopupError('จำนวนเงินใน Webhook ไม่ถูกต้อง', 400)
  }

  const [baht, satang = ''] = value.split('.')
  return BigInt(baht) * 100n + BigInt(satang.padEnd(2, '0'))
}

function verifyTmweasySignature(data: string, signature: string): void {
  const normalizedSignature = signature.trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(normalizedSignature)) {
    throw new TopupError('ลายเซ็น Webhook ไม่ถูกต้อง', 401)
  }

  const expected = createHash('md5')
    .update(`${data}:${env.TMWEASY_API_KEY}`, 'utf8')
    .digest()
  const received = Buffer.from(normalizedSignature, 'hex')

  if (!timingSafeEqual(received, expected)) {
    throw new TopupError('ลายเซ็น Webhook ไม่ถูกต้อง', 401)
  }
}

function safeProviderMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null

  const sanitized = message.replace(/[\r\n\t]+/g, ' ').trim()
  return sanitized ? sanitized.slice(0, 300) : null
}

function providerFailure(
  stage: 'create_pay' | 'detail_pay',
  response: ProviderResponse,
  fallbackMessage: string,
): TopupError {
  const providerMessage = safeProviderMessage(response.msg)

  return new TopupError(
    isDev && providerMessage ? `TMW Easy: ${providerMessage}` : fallbackMessage,
    502,
    {
      stage,
      status: response.status ?? null,
      message: providerMessage,
    },
  )
}

async function requestTmweasy(parameters: Record<string, string>): Promise<ProviderResponse> {
  const url = new URL(env.TMWEASY_API_URL)

  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value)
  }

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new TopupError('ไม่สามารถเชื่อมต่อระบบรับชำระเงินได้', 502)
  }

  if (!response.ok) {
    throw new TopupError('ระบบรับชำระเงินตอบกลับผิดพลาด', 502)
  }

  try {
    const body = await response.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body as ProviderResponse
  } catch {
    throw new TopupError('รูปแบบข้อมูลจากระบบรับชำระเงินไม่ถูกต้อง', 502)
  }
}

function providerCredentials() {
  return {
    username: env.TMWEASY_USERNAME,
    password: env.TMWEASY_PASSWORD,
    con_id: env.TMWEASY_CON_ID,
  }
}

async function markTopupFailed(
  id: string,
  reason: string,
  providerDetails?: Record<string, unknown>,
): Promise<void> {
  await db`
    UPDATE topup_transactions
    SET
      status = ${TopupStatus.FAILED},
      provider_payload = ${JSON.stringify({
        error: reason,
        provider: providerDetails ?? null,
      })}::JSONB,
      updated_at = NOW()
    WHERE id = ${id}::UUID
      AND status = ${TopupStatus.PENDING}
  `
}

export async function createTopup(
  userId: string,
  amount: number,
  clientIp: string,
): Promise<CreatedTopup> {
  const config = await getPublicTopupConfig()
  if (!config.features.topup) throw new TopupError('ระบบเติมเงินยังไม่เปิดใช้งาน', 403)

  const selectedPackage = config.topup.packages.find((item) => Number(item.amount) === amount)
  const bonusCoins = selectedPackage?.bonus ?? '0'

  const [pendingTopup] = await db<{ id: string }[]>`
    INSERT INTO topup_transactions (
      user_id,
      provider,
      requested_amount,
      base_coins,
      bonus_coins,
      credited_coins
    ) VALUES (
      ${userId}::UUID,
      'tmweasy',
      ${amount}::NUMERIC,
      ${amount}::NUMERIC,
      ${bonusCoins}::NUMERIC,
      (${amount}::NUMERIC + ${bonusCoins}::NUMERIC)
    )
    RETURNING id
  `

  if (!pendingTopup) {
    throw new Error('Unable to create pending topup transaction')
  }

  try {
    const createResponse = await requestTmweasy({
      ...providerCredentials(),
      amount: String(amount),
      ref1: pendingTopup.id,
      ip: clientIp,
      method: 'create_pay',
    })
    const providerPaymentId = createResponse.id_pay === undefined
      ? ''
      : String(createResponse.id_pay).trim()

    if (!providerSucceeded(createResponse) || !providerPaymentId) {
      throw providerFailure(
        'create_pay',
        createResponse,
        'ไม่สามารถสร้างรายการรับชำระเงินได้',
      )
    }

    await db`
      UPDATE topup_transactions
      SET provider_payment_id = ${providerPaymentId}, updated_at = NOW()
      WHERE id = ${pendingTopup.id}::UUID
        AND status = ${TopupStatus.PENDING}
    `

    const detailResponse = await requestTmweasy({
      ...providerCredentials(),
      id_pay: providerPaymentId,
      promptpay_id: env.TMWEASY_PROMPTPAY_ID,
      type: env.TMWEASY_PROMPTPAY_TYPE,
      method: 'detail_pay',
    })
    const amountCheckSatang = Number(detailResponse.amount_check)
    const timeOut = Number(detailResponse.time_out)
    const qrImageBase64 = typeof detailResponse.qr_image_base64 === 'string'
      ? detailResponse.qr_image_base64.trim()
      : ''

    if (
      !providerSucceeded(detailResponse)
      || String(detailResponse.ref1) !== pendingTopup.id
      || !Number.isSafeInteger(amountCheckSatang)
      || amountCheckSatang <= 0
      || !Number.isFinite(timeOut)
      || timeOut <= 0
      || !qrImageBase64
    ) {
      throw providerFailure(
        'detail_pay',
        detailResponse,
        'รายละเอียดรายการรับชำระเงินไม่ถูกต้อง',
      )
    }

    const expiresAt = new Date(Date.now() + Math.floor(timeOut) * 1000)
    const providerPayload = {
      create: { status: createResponse.status, id_pay: providerPaymentId },
      detail: {
        status: detailResponse.status,
        ref1: detailResponse.ref1,
        amount_check: amountCheckSatang,
        time_out: Math.floor(timeOut),
      },
    }
    const [transaction] = await db<TopupTransaction[]>`
      UPDATE topup_transactions
      SET
        amount_check_satang = ${amountCheckSatang},
        provider_payload = ${JSON.stringify(providerPayload)}::JSONB,
        expires_at = ${expiresAt},
        updated_at = NOW()
      WHERE id = ${pendingTopup.id}::UUID
        AND status = ${TopupStatus.PENDING}
      RETURNING
        id,
        requested_amount::TEXT,
        base_coins::TEXT,
        bonus_coins::TEXT,
        credited_coins::TEXT,
        status,
        expires_at,
        paid_at,
        created_at
    `

    if (!transaction) {
      throw new TopupError('สถานะรายการเติมเงินมีการเปลี่ยนแปลงแล้ว', 409)
    }

    return {
      transaction,
      payment: {
        provider_payment_id: providerPaymentId,
        amount_check_satang: amountCheckSatang,
        qr_image_base64: qrImageBase64,
        time_out: Math.floor(timeOut),
      },
    }
  } catch (error) {
    const message = error instanceof TopupError
      ? error.message
      : 'ไม่สามารถสร้างรายการรับชำระเงินได้'
    await markTopupFailed(
      pendingTopup.id,
      message,
      error instanceof TopupError ? error.providerDetails : undefined,
    )

    if (error instanceof TopupError) throw error
    throw new TopupError(message, 502)
  }
}

export async function findTopupById(
  userId: string,
  topupId: string,
): Promise<TopupTransaction | null> {
  const [transaction] = await db<TopupTransaction[]>`
    SELECT
      id,
      requested_amount::TEXT,
      base_coins::TEXT,
      bonus_coins::TEXT,
      credited_coins::TEXT,
      CASE
        WHEN status = ${TopupStatus.PENDING} AND expires_at IS NOT NULL AND expires_at <= NOW()
          THEN ${TopupStatus.EXPIRED}::topup_transaction_status
        ELSE status
      END AS status,
      expires_at,
      paid_at,
      created_at
    FROM topup_transactions
    WHERE id = ${topupId}::UUID
      AND user_id = ${userId}::UUID
    LIMIT 1
  `

  return transaction ?? null
}

export async function findTopupHistory(
  userId: string,
  page: number,
  limit: number,
): Promise<TopupHistory> {
  const [count] = await db<{ total: string }[]>`
    SELECT COUNT(*)::TEXT AS total
    FROM topup_transactions
    WHERE user_id = ${userId}::UUID
  `
  const total = Number(count?.total ?? 0)
  const totalPages = Math.ceil(total / limit)
  const safePage = Math.min(page, Math.max(totalPages, 1))
  const transactions = await db<TopupTransaction[]>`
    SELECT
      id,
      requested_amount::TEXT,
      base_coins::TEXT,
      bonus_coins::TEXT,
      credited_coins::TEXT,
      CASE
        WHEN status = ${TopupStatus.PENDING} AND expires_at IS NOT NULL AND expires_at <= NOW()
          THEN ${TopupStatus.EXPIRED}::topup_transaction_status
        ELSE status
      END AS status,
      expires_at,
      paid_at,
      created_at
    FROM topup_transactions
    WHERE user_id = ${userId}::UUID
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit} OFFSET ${(safePage - 1) * limit}
  `

  return {
    transactions,
    pagination: { page: safePage, limit, total, totalPages },
  }
}

export async function processTmweasyWebhook(
  data: string,
  signature: string,
): Promise<void> {
  verifyTmweasySignature(data, signature)
  const payload = parseTmweasyWebhookPayload(data)

  if (payload.id_pay === '100000' && payload.ref1.startsWith('test-id-')) return
  if (!UUID_PATTERN.test(payload.ref1)) {
    throw new TopupError('เลขอ้างอิงรายการเติมเงินไม่ถูกต้อง', 400)
  }

  const paidTransaction = await db.begin(async (transaction) => {
    const [topup] = await transaction<LockedTopup[]>`
      SELECT
        user_id,
        provider_payment_id,
        requested_amount::TEXT,
        amount_check_satang::TEXT,
        credited_coins::TEXT,
        status
      FROM topup_transactions
      WHERE id = ${payload.ref1}::UUID
        AND provider = 'tmweasy'
      FOR UPDATE
    `

    if (!topup) {
      throw new TopupError('ไม่พบรายการเติมเงิน', 404)
    }

    if (
      topup.provider_payment_id !== payload.id_pay
      || topup.amount_check_satang === null
      || BigInt(topup.amount_check_satang) !== BigInt(payload.amount_check)
      || moneyToSatang(topup.requested_amount) !== moneyToSatang(payload.amount)
    ) {
      throw new TopupError('ข้อมูลการชำระเงินไม่ตรงกับรายการ', 409)
    }

    if (topup.status === TopupStatus.PAID) return null
    if (topup.status !== TopupStatus.PENDING) {
      throw new TopupError('รายการเติมเงินไม่อยู่ในสถานะรอชำระเงิน', 409)
    }

    const [creditedUser] = await transaction<{ balance: string }[]>`
      UPDATE users
      SET balance = balance + ${topup.credited_coins}::NUMERIC, updated_at = NOW()
      WHERE id = ${topup.user_id}::UUID
      RETURNING balance::TEXT AS balance
    `
    if (creditedUser) {
      await recordCoinLedger(transaction, {
        userId: topup.user_id,
        entryType: COIN_LEDGER_TYPE.TOPUP,
        amount: topup.credited_coins,
        balanceAfter: creditedUser.balance,
        referenceType: 'topup_transaction',
        referenceId: payload.ref1,
      })
    }

    const [paidTopup] = await transaction<TopupTransaction[]>`
      UPDATE topup_transactions
      SET
        status = ${TopupStatus.PAID},
        paid_at = NOW(),
        provider_payload = provider_payload || jsonb_build_object(
          'webhook',
          ${data}::JSONB
        ),
        updated_at = NOW()
      WHERE id = ${payload.ref1}::UUID
        AND status = ${TopupStatus.PENDING}
      RETURNING
        id,
        requested_amount::TEXT,
        base_coins::TEXT,
        bonus_coins::TEXT,
        credited_coins::TEXT,
        status,
        expires_at,
        paid_at,
        created_at
    `

    if (!paidTopup) {
      throw new TopupError('สถานะรายการเติมเงินมีการเปลี่ยนแปลงแล้ว', 409)
    }

    return paidTopup
  })

  if (paidTransaction) publishTopupEvent(payload.ref1, paidTransaction)
}
