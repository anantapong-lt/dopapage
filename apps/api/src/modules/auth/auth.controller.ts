import { createPendingPhoneRegistration, RegistrationError, verifyEmailRegistration } from './auth.service'
import { verifyLoginTurnstile, verifyRegistrationTurnstile } from './auth.integrations'
import { isFeatureEnabled } from '../site-config/site-config.service'

function registrationErrorResponse(error: unknown) {
  if (error instanceof RegistrationError) {
    return Response.json({ message: error.message, field: error.field }, { status: error.statusCode })
  }

  console.error('Unable to process email registration', error)
  return Response.json({ message: 'ไม่สามารถดำเนินการสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
}

export async function registerWithEmail(body: {
  username: string
  email: string
  phone_number: string
  password: string
  turnstile_token?: string
}) {
  if (!(await isFeatureEnabled('registration'))) {
    return Response.json({ message: 'ขณะนี้ระบบปิดรับสมัครสมาชิกชั่วคราว' }, { status: 403 })
  }

  if (!(await verifyRegistrationTurnstile(body.turnstile_token))) {
    return Response.json({ message: 'กรุณายืนยันว่าคุณไม่ใช่โรบอต', field: 'turnstile_token' }, { status: 400 })
  }

  try {
    await createPendingPhoneRegistration(body.email, body.username, body.phone_number, body.password)

    return Response.json({ message: 'สมัครสมาชิกสำเร็จ สามารถเข้าสู่ระบบได้ทันที' }, { status: 201 })
  } catch (error) {
    return registrationErrorResponse(error)
  }
}

export async function requireLoginTurnstile(token: string | undefined) {
  if (await verifyLoginTurnstile(token)) return

  return Response.json(
    { message: 'ไม่สามารถยืนยัน Cloudflare Turnstile ได้ กรุณาลองใหม่อีกครั้ง', field: 'turnstile_token' },
    { status: 400 },
  )
}

export async function confirmRegistrationEmail(token: string) {
  try {
    await verifyEmailRegistration(token)
    return { message: 'ยืนยันอีเมลสำเร็จ' }
  } catch (error) {
    return registrationErrorResponse(error)
  }
}
