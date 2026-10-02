import { db } from '../../db'
import { env } from '../../config/env'
import type { GoogleProfile } from './auth.service'

const PHONE_OTP_TTL_MINUTES = 10

export class PhoneOtpProviderError extends Error {
  public readonly providerMessage?: string

  get rateLimitMessage(): string | undefined {
    const match = this.providerMessage?.match(/^ส่ง OTP มากเกินไป กรุณารอ (\d{1,3}) นาที$/)
    if ((this.providerStatus === 400 || this.providerStatus === 429) && match) {
      return `ส่ง OTP มากเกินไป กรุณารอ ${match[1]} นาที`
    }
    if (this.providerStatus === 429) return 'ขอรหัส OTP บ่อยเกินไป กรุณารอแล้วลองใหม่'
    return undefined
  }

  constructor(
    public readonly reason: 'not_configured' | 'unavailable' | 'rejected',
    public readonly providerStatus?: number,
    payload?: unknown,
  ) {
    super(reason)
    if (payload && typeof payload === 'object') {
      const details = payload as Record<string, unknown>
      const providerError = details.error
      const message = typeof details.message === 'string' ? details.message
        : typeof providerError === 'string' ? providerError
        : providerError && typeof providerError === 'object' && 'message' in providerError && typeof providerError.message === 'string'
          ? providerError.message : undefined
      if (message) {
        this.providerMessage = message
          .split(env.BOOST_SMS_API_KEY || '\0').join('[redacted]')
          .replace(/Bearer\s+\S+|sk_live_\S+|[A-Za-z0-9_-]{24,}/gi, '[redacted]')
          .replace(/[\w.+-]+@[\w.-]+/g, '[email]')
          .replace(/\+?\d[\d\s()-]{3,}\d/g, '[number]')
          .replace(/[\r\n\t]/g, ' ')
          .slice(0, 500)
      }
    }
  }
}

function boostSmsApiKey() {
  if (!env.BOOST_SMS_API_KEY) {
    throw new PhoneOtpProviderError('not_configured')
  }
  return env.BOOST_SMS_API_KEY
}

async function boostSmsOtpRequest(path: '/api/v1/otp/send' | '/api/v1/otp/verify', body: Record<string, string>) {
  const apiKey = boostSmsApiKey()

  try {
    const response = await fetch(`https://app.boost-sms.com${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    const payload: unknown = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, payload }
  } catch (error) {
    if (error instanceof PhoneOtpProviderError) throw error
    throw new PhoneOtpProviderError('unavailable')
  }
}

export async function requestBoostSmsOtp(phoneNumber: string): Promise<string> {
  const phone = phoneNumber.startsWith('+66') ? `0${phoneNumber.slice(3)}` : phoneNumber
  const { ok, status, payload } = await boostSmsOtpRequest('/api/v1/otp/send', { phone, purpose: 'verify' })
  if (!ok) throw new PhoneOtpProviderError(status >= 500 ? 'unavailable' : 'rejected', status, payload)
  if (!payload || typeof payload !== 'object' || !('ref' in payload) || typeof payload.ref !== 'string' || !payload.ref) {
    throw new PhoneOtpProviderError('unavailable')
  }
  const ref = payload.ref.trim()
  if (!ref) throw new PhoneOtpProviderError('unavailable')
  return ref
}

export async function verifyBoostSmsOtp(ref: string, otp: string): Promise<boolean> {
  const { ok, payload } = await boostSmsOtpRequest('/api/v1/otp/verify', { ref: ref.trim(), code: otp })
  return Boolean(ok && payload && typeof payload === 'object' && 'valid' in payload && payload.valid === true && 'verified' in payload && payload.verified === true)
}

export async function getAccountSecurity(userId: string) {
  const [account] = await db<{
    email: string
    email_verified: boolean
    phone_number: string | null
    phone_verified: boolean
    pending_phone_number: string | null
    has_password: boolean
    google_email: string | null
    google_linked_at: Date | null
  }[]>`
    SELECT u.email, u.email_verified_at IS NOT NULL AS email_verified,
      u.phone_number, u.phone_verified_at IS NOT NULL AS phone_verified,
      phone_request.phone_number AS pending_phone_number,
      EXISTS(SELECT 1 FROM user_password_credentials WHERE user_id = u.id) AS has_password,
      oauth.provider_email AS google_email, oauth.created_at AS google_linked_at
    FROM users AS u
    LEFT JOIN user_oauth_accounts AS oauth ON oauth.user_id = u.id AND oauth.provider = 'google'
    LEFT JOIN phone_verification_requests AS phone_request ON phone_request.user_id = u.id AND phone_request.expires_at > NOW()
    WHERE u.id = ${userId} AND u.status = 'active' AND u.deleted_at IS NULL
    LIMIT 1
  `
  return account ?? null
}

export async function requestPhoneVerification(userId: string, phoneNumber: string): Promise<'sent' | 'inactive' | 'phone_in_use'> {
  const [user] = await db<{ id: string }[]>`
    SELECT id FROM users
    WHERE id = ${userId} AND status = 'active'
      AND deleted_at IS NULL
    LIMIT 1
  `
  if (!user) return 'inactive'

  const [owner] = await db<{ id: string }[]>`
    SELECT id FROM users
    WHERE phone_number = ${phoneNumber} AND id <> ${userId} AND deleted_at IS NULL
    LIMIT 1
  `
  if (owner) return 'phone_in_use'

  const providerToken = await requestBoostSmsOtp(phoneNumber)

  await db`
    INSERT INTO phone_verification_requests (user_id, phone_number, provider_token, expires_at)
    VALUES (${userId}, ${phoneNumber}, ${providerToken}, NOW() + (${PHONE_OTP_TTL_MINUTES} * INTERVAL '1 minute'))
    ON CONFLICT (user_id) DO UPDATE SET
      phone_number = EXCLUDED.phone_number,
      provider_token = EXCLUDED.provider_token,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `
  return 'sent'
}

export async function verifyPhoneVerification(
  userId: string,
  phoneNumber: string,
  otp: string,
): Promise<'verified' | 'inactive' | 'invalid_otp' | 'expired' | 'phone_in_use'> {
  try {
    return await db.begin(async (transaction) => {
      const [request] = await transaction<{ provider_token: string; expires_at: Date }[]>`
        SELECT provider_token, expires_at
        FROM phone_verification_requests
        WHERE user_id = ${userId} AND phone_number = ${phoneNumber}
        LIMIT 1
        FOR UPDATE
      `
      if (!request) return 'invalid_otp'
      if (new Date(request.expires_at).getTime() <= Date.now()) {
        await transaction`DELETE FROM phone_verification_requests WHERE user_id = ${userId}`
        return 'expired'
      }

      if (!(await verifyBoostSmsOtp(request.provider_token, otp))) return 'invalid_otp'

      const updated = await transaction<{ id: string }[]>`
        UPDATE users
        SET phone_number = ${phoneNumber}, phone_verified_at = NOW(), updated_at = NOW()
        WHERE id = ${userId} AND status = 'active'
          AND deleted_at IS NULL
        RETURNING id
      `
      if (!updated.length) return 'inactive'
      await transaction`DELETE FROM phone_verification_requests WHERE user_id = ${userId}`
      return 'verified'
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return 'phone_in_use'
    throw error
  }
}

export async function changeAccountPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<'changed' | 'no_password' | 'invalid_password' | 'conflict'> {
  const [credentials] = await db<{ password_hash: string }[]>`
    SELECT credentials.password_hash
    FROM user_password_credentials AS credentials
    INNER JOIN users AS u ON u.id = credentials.user_id
    WHERE u.id = ${userId} AND u.status = 'active'
      AND (u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL) AND u.deleted_at IS NULL
    LIMIT 1
  `
  if (!credentials) return 'no_password'
  if (!(await Bun.password.verify(currentPassword, credentials.password_hash))) return 'invalid_password'

  const passwordHash = await Bun.password.hash(newPassword)
  // Compare the old hash as well so simultaneous changes cannot overwrite each other.
  const updated = await db<{ user_id: string }[]>`
    UPDATE user_password_credentials AS credentials
    SET password_hash = ${passwordHash}, password_changed_at = NOW(), updated_at = NOW()
    WHERE credentials.user_id = ${userId}
      AND credentials.password_hash = ${credentials.password_hash}
      AND EXISTS (
        SELECT 1 FROM users WHERE id = ${userId} AND status = 'active'
          AND (email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL) AND deleted_at IS NULL
      )
    RETURNING user_id
  `
  return updated.length === 1 ? 'changed' : 'conflict'
}

export async function setAccountPassword(
  userId: string,
  newPassword: string,
): Promise<'set' | 'already_set' | 'inactive'> {
  const passwordHash = await Bun.password.hash(newPassword)

  return db.begin(async (transaction) => {
    const [user] = await transaction<{ id: string }[]>`
      SELECT id
      FROM users
      WHERE id = ${userId} AND status = 'active'
        AND (email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL) AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `
    if (!user) return 'inactive'

    const inserted = await transaction<{ user_id: string }[]>`
      INSERT INTO user_password_credentials (user_id, password_hash)
      VALUES (${userId}, ${passwordHash})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    `
    return inserted.length === 1 ? 'set' : 'already_set'
  })
}

export async function unlinkGoogleAccount(
  userId: string,
  currentPassword: string,
): Promise<'unlinked' | 'no_password' | 'invalid_password' | 'not_linked'> {
  return db.begin(async (transaction) => {
    const [credentials] = await transaction<{ password_hash: string }[]>`
      SELECT credentials.password_hash
      FROM user_password_credentials AS credentials
      INNER JOIN users AS u ON u.id = credentials.user_id
      WHERE u.id = ${userId} AND u.status = 'active'
        AND (u.email_verified_at IS NOT NULL OR u.phone_verified_at IS NOT NULL) AND u.deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `
    if (!credentials) return 'no_password'
    if (!(await Bun.password.verify(currentPassword, credentials.password_hash))) return 'invalid_password'

    const deleted = await transaction<{ id: string }[]>`
      DELETE FROM user_oauth_accounts
      WHERE user_id = ${userId} AND provider = 'google'
      RETURNING id
    `
    return deleted.length === 1 ? 'unlinked' : 'not_linked'
  })
}

export type GoogleLinkStatus = 'linked' | 'inactive' | 'email_mismatch' | 'already_linked'

/** Only links a verified Google identity to the authenticated owner of the same email. */
export async function linkGoogleAccount(userId: string, profile: GoogleProfile): Promise<GoogleLinkStatus> {
  const email = profile.email.trim().toLowerCase()
  try {
    return await db.begin(async (transaction) => {
      const [user] = await transaction<{ email: string }[]>`
        SELECT email FROM users
        WHERE id = ${userId} AND status = 'active'
          AND (email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL) AND deleted_at IS NULL
        FOR UPDATE
      `
      if (!user) return 'inactive'
      if (user.email.trim().toLowerCase() !== email) return 'email_mismatch'

      const existing = await transaction<{ user_id: string; provider_account_id: string }[]>`
        SELECT user_id, provider_account_id FROM user_oauth_accounts
        WHERE provider = 'google'
          AND (user_id = ${userId} OR provider_account_id = ${profile.id})
      `
      if (existing.length > 0) {
        return existing.length === 1 && existing[0].user_id === userId && existing[0].provider_account_id === profile.id
          ? 'linked' : 'already_linked'
      }

      await transaction`
        INSERT INTO user_oauth_accounts (user_id, provider, provider_account_id, provider_email)
        VALUES (${userId}, 'google', ${profile.id}, ${email})
      `
      return 'linked'
    })
  } catch (error) {
    // A concurrent callback must never replace another account's Google identity.
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return 'already_linked'
    }
    throw error
  }
}
