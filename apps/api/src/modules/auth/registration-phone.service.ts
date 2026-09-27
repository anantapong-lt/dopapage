import { db } from '../../db'
import { env } from '../../config/env'
import { PhoneOtpProviderError } from './account-security.service'

const REGISTRATION_PHONE_TTL_MINUTES = 5

function hash(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}

function asThaiMobile(phoneNumber: string): string {
  return `+66${phoneNumber.slice(1)}`
}

async function providerRequest(path: '/api/v1/otp/send' | '/api/v1/otp/verify', body: Record<string, string>) {
  if (!env.BOOST_SMS_API_KEY) throw new PhoneOtpProviderError('not_configured')
  try {
    const response = await fetch(`https://app.boost-sms.com${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.BOOST_SMS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    return { ok: response.ok, status: response.status, payload: await response.json().catch(() => null) as unknown }
  } catch {
    throw new PhoneOtpProviderError('unavailable')
  }
}

export async function requestRegistrationPhoneOtp(phone: string): Promise<{ verificationId: string; expiresIn: number }> {
  const phoneNumber = asThaiMobile(phone)
  const [owner] = await db<{ id: string }[]>`SELECT id FROM users WHERE phone_number = ${phoneNumber} AND deleted_at IS NULL LIMIT 1`
  if (owner) return Promise.reject('phone_in_use')

  const { ok, status, payload } = await providerRequest('/api/v1/otp/send', { phone, purpose: 'verify' })
  if (!ok) throw new PhoneOtpProviderError(status >= 500 ? 'unavailable' : 'rejected', status, payload)
  if (!payload || typeof payload !== 'object' || !('ref' in payload) || typeof payload.ref !== 'string' || !payload.ref) {
    throw new PhoneOtpProviderError('unavailable')
  }
  const providerToken = payload.ref.trim()
  if (!providerToken) throw new PhoneOtpProviderError('unavailable')

  const verificationId = crypto.randomUUID()
  await db`
    DELETE FROM phone_verification_requests WHERE expires_at <= NOW()
  `
  await db`
    INSERT INTO phone_verification_requests (id, user_id, phone_number, provider_token, expires_at)
    VALUES (${verificationId}, NULL, ${phoneNumber}, ${providerToken}, NOW() + (${REGISTRATION_PHONE_TTL_MINUTES} * INTERVAL '1 minute'))
  `
  return { verificationId, expiresIn: REGISTRATION_PHONE_TTL_MINUTES * 60 }
}

export async function verifyRegistrationPhoneOtp(verificationId: string, otp: string): Promise<{ verificationToken: string } | 'invalid_otp' | 'expired' | 'phone_in_use'> {
  return db.begin(async (transaction) => {
    const [request] = await transaction<{ phone_number: string; provider_token: string; expires_at: Date }[]>`
      SELECT phone_number, provider_token, expires_at FROM phone_verification_requests
      WHERE id = ${verificationId} AND user_id IS NULL AND verified_at IS NULL LIMIT 1 FOR UPDATE
    `
    if (!request || new Date(request.expires_at).getTime() <= Date.now()) return 'expired'

    const { ok, status, payload } = await providerRequest('/api/v1/otp/verify', { ref: request.provider_token.trim(), code: otp })
    if (!ok) {
      if (status === 400 || status === 404) return 'invalid_otp'
      if (status === 410) return 'expired'
      throw new PhoneOtpProviderError(status >= 500 ? 'unavailable' : 'rejected', status, payload)
    }
    if (!payload || typeof payload !== 'object' || !('valid' in payload) || payload.valid !== true || !('verified' in payload) || payload.verified !== true) return 'invalid_otp'

    const [owner] = await transaction<{ id: string }[]>`SELECT id FROM users WHERE phone_number = ${request.phone_number} AND deleted_at IS NULL LIMIT 1`
    if (owner) return 'phone_in_use'

    const verificationToken = crypto.randomUUID() + crypto.randomUUID()
    await transaction`
      UPDATE phone_verification_requests
      SET verified_at = NOW(), verification_token_hash = ${hash(verificationToken)}, updated_at = NOW()
      WHERE id = ${verificationId}
    `
    return { verificationToken }
  })
}

export async function consumeRegistrationPhoneVerification(
  transaction: typeof db,
  verificationId: string,
  verificationToken: string,
): Promise<string | null> {
  const [verification] = await transaction<{ phone_number: string }[]>`
    UPDATE phone_verification_requests
    SET consumed_at = NOW(), updated_at = NOW()
    WHERE id = ${verificationId}
      AND user_id IS NULL
      AND verification_token_hash = ${hash(verificationToken)}
      AND verified_at IS NOT NULL
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING phone_number
  `
  return verification?.phone_number ?? null
}
