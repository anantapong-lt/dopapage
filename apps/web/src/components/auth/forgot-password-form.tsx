'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { confirmPasswordReset, requestPasswordReset, verifyPasswordReset } from '@/controllers/auth.controller'
import { IconInput, PasswordInput } from './form-inputs'
import { TurnstileWidget } from './turnstile-widget'
import { Input } from '@/components/ui/input'

type Step = 'request' | 'verify' | 'password'

const OTP_RATE_LIMIT_MS = 10 * 60 * 1000

export function ForgotPasswordForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetId, setResetId] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [maskedPhoneNumber, setMaskedPhoneNumber] = useState<string | undefined>()
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpRateLimitUntil, setOtpRateLimitUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const otpInputs = useRef<Array<HTMLInputElement | null>>([])
  const turnstileRequired = process.env.NODE_ENV !== 'development'
  const otpRateLimitRemainingSeconds = otpRateLimitUntil ? Math.max(0, Math.ceil((otpRateLimitUntil - now) / 1000)) : 0

  useEffect(() => {
    if (!otpRateLimitUntil) return

    const updateRemainingTime = () => {
      const currentTime = Date.now()
      if (currentTime >= otpRateLimitUntil) {
        setOtpRateLimitUntil(null)
        return
      }
      setNow(currentTime)
    }

    updateRemainingTime()
    const interval = window.setInterval(updateRemainingTime, 1_000)
    window.addEventListener('focus', updateRemainingTime)
    document.addEventListener('visibilitychange', updateRemainingTime)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', updateRemainingTime)
      document.removeEventListener('visibilitychange', updateRemainingTime)
    }
  }, [otpRateLimitUntil])

  function messageFrom(error: unknown, fallback: string) {
    return error instanceof ApiError || error instanceof Error ? error.message : fallback
  }

  function applyOtp(start: number, value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6 - start)
    const next = otp.padEnd(6, ' ').split('')
    if (!digits) {
      next[start] = ' '
      setOtp(next.join('').trimEnd())
      return
    }

    digits.split('').forEach((digit, offset) => { next[start + offset] = digit })
    setOtp(next.join('').trimEnd())
    requestAnimationFrame(() => otpInputs.current[Math.min(start + digits.length, 5)]?.focus())
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (turnstileRequired && !turnstileToken) {
      setError('กรุณายืนยัน Cloudflare Turnstile')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await requestPasswordReset(email, turnstileToken ?? undefined)
      setResetId(result.reset_id)
      setMaskedPhoneNumber(result.masked_phone_number)
      setStep('verify')
      requestAnimationFrame(() => otpInputs.current[0]?.focus())
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 429) {
        setNow(Date.now())
        setOtpRateLimitUntil(Date.now() + OTP_RATE_LIMIT_MS)
      }
      setError(messageFrom(cause, 'ไม่สามารถส่งรหัส OTP ได้ กรุณาลองใหม่อีกครั้ง'))
    } finally {
      setTurnstileToken(null)
      setTurnstileKey((current) => current + 1)
      setIsSubmitting(false)
    }
  }

  async function submitOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{6}$/.test(otp)) {
      setError('กรุณากรอกรหัส OTP 6 หลัก')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await verifyPasswordReset(resetId, otp)
      setResetToken(result.reset_token)
      setStep('password')
    } catch (cause) {
      setError(messageFrom(cause, 'ไม่สามารถยืนยันรหัส OTP ได้ กรุณาลองใหม่อีกครั้ง'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 8) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (password !== confirmPassword) {
      setError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await confirmPasswordReset(resetId, resetToken, password, confirmPassword)
      toast.success(result.message)
      router.replace('/login')
    } catch (cause) {
      setError(messageFrom(cause, 'ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองใหม่อีกครั้ง'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={step === 'request' ? submitRequest : step === 'verify' ? submitOtp : submitPassword} className="flex flex-col gap-4" aria-busy={isSubmitting}>
      {step === 'request' && <>
        <p className="text-center text-sm text-muted-foreground">กรอกอีเมลที่ใช้สมัคร เราจะส่ง OTP ไปยังเบอร์มือถือที่ยืนยันไว้กับบัญชี</p>
        <IconInput type="email" icon={<Mail className="size-4" />} placeholder="อีเมล" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <TurnstileWidget key={turnstileKey} action="password_reset" onTokenChange={setTurnstileToken} />
      </>}
      {step === 'verify' && <>
        <p className="text-center text-sm text-muted-foreground">{maskedPhoneNumber ? <>เราได้ส่งรหัส OTP 6 หลักไปยัง <span className="font-medium text-foreground">{maskedPhoneNumber}</span></> : 'หากข้อมูลบัญชีถูกต้อง ระบบได้ส่งรหัส OTP ไปยังเบอร์มือถือที่ยืนยันไว้แล้ว'}</p>
        <div role="group" aria-label="กรอกรหัส OTP 6 หลัก" className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, index) => <Input key={index} ref={(element) => { otpInputs.current[index] = element }} value={otp[index] ?? ''} onChange={(event) => applyOtp(index, event.target.value)} onPaste={(event) => { event.preventDefault(); applyOtp(index, event.clipboardData.getData('text')) }} onKeyDown={(event) => { if (event.key === 'Backspace' && !otp[index] && index > 0) otpInputs.current[index - 1]?.focus() }} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} pattern="[0-9]*" maxLength={6} disabled={isSubmitting} aria-label={`เลข OTP หลักที่ ${index + 1}`} className="h-12 min-w-0 px-0 text-center text-lg font-semibold tabular-nums" />)}
        </div>
      </>}
      {step === 'password' && <>
        <p className="text-center text-sm text-muted-foreground">ตั้งรหัสผ่านใหม่ที่มีความยาวอย่างน้อย 8 ตัวอักษร</p>
        <PasswordInput icon={<Lock className="size-4" />} placeholder="รหัสผ่านใหม่" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <PasswordInput icon={<Lock className="size-4" />} placeholder="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
      </>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={isSubmitting || otpRateLimitRemainingSeconds > 0 || (step === 'request' && turnstileRequired && !turnstileToken)} className="h-11 w-full rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
        {isSubmitting
          ? 'กำลังดำเนินการ...'
          : step === 'request' && otpRateLimitRemainingSeconds > 0
            ? `ส่ง OTP ได้อีกครั้งใน ${String(Math.floor(otpRateLimitRemainingSeconds / 60)).padStart(2, '0')}:${String(otpRateLimitRemainingSeconds % 60).padStart(2, '0')}`
            : step === 'request'
              ? 'ส่งรหัส OTP'
              : step === 'verify'
                ? 'ยืนยัน OTP'
                : 'ตั้งรหัสผ่านใหม่'}
      </button>
      <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-primary hover:underline">กลับไปเข้าสู่ระบบ</Link>
    </form>
  )
}
