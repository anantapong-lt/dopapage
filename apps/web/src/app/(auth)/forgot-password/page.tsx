import type { Metadata } from 'next'
import { AuthCard } from '@/components/auth/auth-card'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = {
  title: 'ลืมรหัสผ่าน',
  alternates: { canonical: '/forgot-password' },
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return <AuthCard heading="ตั้งรหัสผ่านใหม่"><ForgotPasswordForm /></AuthCard>
}
