'use client'

import { requestPhoneVerification, verifyPhoneVerification } from '@/controllers/auth.controller'
import { userRole, type AuthUser } from '@/interface/user.interface'
import { PhoneVerificationDialog } from './phone-verification-dialog'

interface PhoneVerificationGateProps {
  accessToken: string | null
  user: AuthUser | null
  onVerified: () => Promise<boolean>
}

export function PhoneVerificationGate({ accessToken, user, onVerified }: PhoneVerificationGateProps) {
  const verificationRequired = Boolean(
    accessToken && user && !user.phone_verified && user.role !== userRole.SUPER_ADMIN,
  )
  const initialPhoneNumber = user?.phone_number?.startsWith('+66')
    ? `0${user.phone_number.slice(3)}`
    : user?.phone_number ?? ''

  async function requestOtp(phoneNumber: string, turnstileToken: string | undefined) {
    if (!accessToken) throw new Error('ไม่พบเซสชันผู้ใช้')
    await requestPhoneVerification(phoneNumber, accessToken, turnstileToken)
  }

  async function verifyOtp(phoneNumber: string, otp: string) {
    if (!accessToken) throw new Error('ไม่พบเซสชันผู้ใช้')
    await verifyPhoneVerification({ phone_number: phoneNumber, otp }, accessToken)
    const refreshed = await onVerified()
    if (!refreshed) throw new Error('ไม่สามารถอัปเดตสถานะการยืนยันได้')
  }

  return (
    <PhoneVerificationDialog
      open={verificationRequired}
      required
      initialPhoneNumber={initialPhoneNumber}
      onRequestOtp={(phoneNumber, turnstileToken) => requestOtp(phoneNumber, turnstileToken)}
      onVerifyOtp={verifyOtp}
    />
  )
}
