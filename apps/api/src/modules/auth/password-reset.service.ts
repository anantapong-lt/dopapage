import { db } from '../../db'
import { requestBoostSmsOtp, verifyBoostSmsOtp } from './account-security.service'

const PASSWORD_RESET_TTL_MINUTES = 5

function hash(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}

function maskPhoneNumber(phoneNumber: string): string {
  const local = phoneNumber.startsWith('+66') ? `0${phoneNumber.slice(3)}` : phoneNumber
  return `${local.slice(0, 3)}-xxx-${local.slice(-4)}`
}

export async function requestPasswordReset(email: string): Promise<{ resetId: string; maskedPhoneNumber?: string }> {
  const resetId = crypto.randomUUID()
  const [user] = await db<{ id: string; phone_number: string | null }[]>`
    SELECT id, phone_number
    FROM users
    WHERE LOWER(email) = LOWER(${email.trim()})
      AND status = 'active'
      AND deleted_at IS NULL
      AND phone_number IS NOT NULL
      AND phone_verified_at IS NOT NULL
    LIMIT 1
  `

  if (!user?.phone_number) {
    await db`
      INSERT INTO password_reset_requests (id, expires_at)
      VALUES (${resetId}, NOW() + (${PASSWORD_RESET_TTL_MINUTES} * INTERVAL '1 minute'))
    `
    return { resetId }
  }

  const providerToken = await requestBoostSmsOtp(user.phone_number)
  await db.begin(async (transaction) => {
    await transaction`DELETE FROM password_reset_requests WHERE user_id = ${user.id} AND consumed_at IS NULL`
    await transaction`
      INSERT INTO password_reset_requests (id, user_id, provider_token, expires_at)
      VALUES (${resetId}, ${user.id}, ${providerToken}, NOW() + (${PASSWORD_RESET_TTL_MINUTES} * INTERVAL '1 minute'))
    `
  })
  return { resetId, maskedPhoneNumber: maskPhoneNumber(user.phone_number) }
}

export async function verifyPasswordReset(resetId: string, otp: string): Promise<{ resetToken: string } | 'invalid_otp' | 'expired'> {
  return db.begin(async (transaction) => {
    const [request] = await transaction<{ provider_token: string | null; expires_at: Date }[]>`
      SELECT provider_token, expires_at
      FROM password_reset_requests
      WHERE id = ${resetId} AND verified_at IS NULL AND consumed_at IS NULL
      LIMIT 1 FOR UPDATE
    `
    if (!request || new Date(request.expires_at).getTime() <= Date.now()) return 'expired'
    if (!request.provider_token || !(await verifyBoostSmsOtp(request.provider_token, otp))) return 'invalid_otp'

    const resetToken = crypto.randomUUID() + crypto.randomUUID()
    await transaction`
      UPDATE password_reset_requests
      SET verified_at = NOW(), reset_token_hash = ${hash(resetToken)}, updated_at = NOW()
      WHERE id = ${resetId}
    `
    return { resetToken }
  })
}

export async function confirmPasswordReset(resetId: string, resetToken: string, password: string): Promise<'reset' | 'invalid_token' | 'expired'> {
  return db.begin(async (transaction) => {
    const [request] = await transaction<{ user_id: string | null; expires_at: Date }[]>`
      SELECT user_id, expires_at
      FROM password_reset_requests
      WHERE id = ${resetId}
        AND reset_token_hash = ${hash(resetToken)}
        AND verified_at IS NOT NULL
        AND consumed_at IS NULL
      LIMIT 1 FOR UPDATE
    `
    if (!request) return 'invalid_token'
    if (!request.user_id || new Date(request.expires_at).getTime() <= Date.now()) return 'expired'

    const passwordHash = await Bun.password.hash(password)
    await transaction`
      INSERT INTO user_password_credentials (user_id, password_hash, password_changed_at)
      VALUES (${request.user_id}, ${passwordHash}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        password_changed_at = NOW(),
        updated_at = NOW()
    `
    await transaction`
      UPDATE password_reset_requests
      SET consumed_at = NOW(), updated_at = NOW()
      WHERE id = ${resetId}
    `
    await transaction`
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, NOW()), updated_at = NOW()
      WHERE user_id = ${request.user_id} AND revoked_at IS NULL
    `
    return 'reset'
  })
}
