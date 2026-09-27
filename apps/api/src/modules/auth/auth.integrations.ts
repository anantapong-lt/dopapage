import { env, isDev } from '../../config/env'

interface TurnstileResponse {
  success: boolean
  action?: string
}

interface ResendResponse {
  id?: string
  message?: string
}

async function verifyTurnstile(
  token: string | undefined,
  expectedAction: 'register' | 'login' | 'phone_verification',
): Promise<boolean> {
  if (isDev) return true
  if (!env.TURNSTILE_SECRET_KEY || !token) return false

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        idempotency_key: crypto.randomUUID(),
      }),
    })
    if (!response.ok) return false

    const result = (await response.json()) as TurnstileResponse
    return result.success && result.action === expectedAction
  } catch {
    return false
  }
}

export function verifyRegistrationTurnstile(token: string | undefined): Promise<boolean> {
  return verifyTurnstile(token, 'register')
}

export function verifyLoginTurnstile(token: string | undefined): Promise<boolean> {
  return verifyTurnstile(token, 'login')
}

export function verifyPhoneVerificationTurnstile(token: string | undefined): Promise<boolean> {
  return verifyTurnstile(token, 'phone_verification')
}

export async function sendVerificationEmail(recipient: string, verificationToken: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error('Resend is not configured')
  }

  const verificationUrl = new URL('/verify-email', env.WEB_ORIGIN)
  verificationUrl.searchParams.set('token', verificationToken)

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [recipient],
      subject: 'ยืนยันอีเมลสำหรับบัญชี Dopapage',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h1 style="font-size:22px">ยืนยันอีเมลของคุณ</h1>
          <p>กดปุ่มด้านล่างเพื่อเปิดใช้งานบัญชี Dopapage ลิงก์นี้มีอายุ ${env.EMAIL_VERIFICATION_TTL_HOURS} ชั่วโมง</p>
          <p>
            <a href="${verificationUrl.toString()}" style="display:inline-block;border-radius:8px;background:#7c3aed;padding:12px 20px;color:#fff;text-decoration:none">
              ยืนยันอีเมล
            </a>
          </p>
          <p>หากคุณไม่ได้สมัครสมาชิก สามารถละเว้นอีเมลฉบับนี้ได้</p>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as ResendResponse | null
    throw new Error(result?.message ?? `Resend returned ${response.status}`)
  }
}
