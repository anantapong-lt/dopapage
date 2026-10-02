import { verifyPasswordResetTurnstile } from './auth.integrations'
import { PhoneOtpProviderError } from './account-security.service'
import type { PasswordResetConfirmBody, PasswordResetRequestBody, PasswordResetVerifyBody } from './auth.schema'
import { confirmPasswordReset, requestPasswordReset, verifyPasswordReset } from './password-reset.service'

const GENERIC_MESSAGE = 'หากข้อมูลบัญชีและเบอร์มือถือที่ยืนยันไว้ถูกต้อง ระบบได้ส่งรหัส OTP ให้แล้ว'

function providerError(error: PhoneOtpProviderError): Response {
  if (error.rateLimitMessage) return Response.json({ message: error.rateLimitMessage }, { status: 429 })
  if (error.reason === 'not_configured' || error.providerStatus === 401 || error.providerStatus === 403) {
    return Response.json({ message: 'ระบบ OTP ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง' }, { status: 503 })
  }
  return Response.json({ message: 'ไม่สามารถส่งรหัส OTP ได้ กรุณาลองใหม่อีกครั้ง' }, { status: 503 })
}

export async function requestPasswordResetResponse(body: PasswordResetRequestBody) {
  if (!(await verifyPasswordResetTurnstile(body.turnstile_token))) {
    return Response.json({ message: 'กรุณายืนยัน Cloudflare Turnstile ก่อนขอรหัส OTP', field: 'turnstile_token' }, { status: 400 })
  }
  try {
    const result = await requestPasswordReset(body.email)
    return { message: GENERIC_MESSAGE, reset_id: result.resetId, masked_phone_number: result.maskedPhoneNumber }
  } catch (error) {
    if (error instanceof PhoneOtpProviderError) return providerError(error)
    console.error('Unable to request password reset OTP', error)
    return Response.json({ message: 'ไม่สามารถส่งรหัส OTP ได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
  }
}

export async function verifyPasswordResetResponse(body: PasswordResetVerifyBody) {
  try {
    const result = await verifyPasswordReset(body.reset_id, body.otp)
    if (result === 'expired') return Response.json({ message: 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่' }, { status: 410 })
    if (result === 'invalid_otp') return Response.json({ message: 'รหัส OTP ไม่ถูกต้อง', field: 'otp' }, { status: 400 })
    return { message: 'ยืนยัน OTP สำเร็จ', reset_token: result.resetToken }
  } catch (error) {
    if (error instanceof PhoneOtpProviderError) return providerError(error)
    console.error('Unable to verify password reset OTP', error)
    return Response.json({ message: 'ไม่สามารถยืนยันรหัส OTP ได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
  }
}

export async function confirmPasswordResetResponse(body: PasswordResetConfirmBody) {
  if (body.new_password !== body.confirm_password) {
    return Response.json({ message: 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน', field: 'confirm_password' }, { status: 400 })
  }
  try {
    const result = await confirmPasswordReset(body.reset_id, body.reset_token, body.new_password)
    if (result === 'expired') return Response.json({ message: 'คำขอเปลี่ยนรหัสผ่านหมดอายุแล้ว กรุณาเริ่มใหม่' }, { status: 410 })
    if (result === 'invalid_token') return Response.json({ message: 'ไม่สามารถยืนยันคำขอเปลี่ยนรหัสผ่านได้ กรุณาเริ่มใหม่' }, { status: 400 })
    return { message: 'ตั้งรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบอีกครั้ง' }
  } catch (error) {
    console.error('Unable to confirm password reset', error)
    return Response.json({ message: 'ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
