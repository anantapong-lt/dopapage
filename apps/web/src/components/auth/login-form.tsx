'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Mail } from 'lucide-react'
import { useAuth } from './auth-provider'
import { IconInput, PasswordInput } from './form-inputs'
import { TurnstileWidget } from './turnstile-widget'
import { ApiError } from '@/lib/api-client'
import { getApiUrl } from '@/site.config'

const loginSchema = z.object({
  email: z.string().email('กรุณากรอกอีเมลให้ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm({ registrationEnabled }: { registrationEnabled: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, status } = useAuth()
  const oauthError = searchParams.get('oauth_error')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const turnstileRequired = process.env.NODE_ENV !== 'development'
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginValues) {
    if (turnstileRequired && !turnstileToken) {
      setError('root', { message: 'กรุณายืนยัน Cloudflare Turnstile' })
      return
    }

    try {
      await login(values.email, values.password, turnstileToken ?? undefined)
      const next = searchParams.get('next')
      const returnTo = next?.startsWith('/') && !next.startsWith('//') ? next : null
      router.replace(returnTo ?? '/')
    } catch (error) {
      setError('root', {
        message: error instanceof ApiError
          ? error.message
          : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      })
    } finally {
      setTurnstileToken(null)
      setTurnstileKey((current) => current + 1)
    }
  }

  function signInWithGoogle() {
    const next = searchParams.get('next')
    const url = new URL(getApiUrl('/auth/google'))
    if (next?.startsWith('/') && !next.startsWith('//')) url.searchParams.set('next', next)
    window.location.assign(url.toString())
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-busy={isSubmitting}>
      <div>
        <IconInput
          type="email"
          icon={<Mail className="size-4" />}
          placeholder="อีเมล"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div>
        <PasswordInput
          icon={<Lock className="size-4" />}
          placeholder="รหัสผ่าน"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <TurnstileWidget
        key={turnstileKey}
        action="login"
        onTokenChange={setTurnstileToken}
      />

      <button
        type="submit"
        disabled={isSubmitting || status === 'loading' || (turnstileRequired && !turnstileToken)}
        className="h-11 w-full cursor-pointer rounded-lg bg-primary px-4 text-base font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
      </button>

      {errors.root?.message && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">หรือ</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-border bg-white px-4 text-base font-medium text-black transition-colors hover:bg-muted"
      >
        <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.39 13.86A6 6 0 0 1 6.07 12c0-.65.11-1.28.32-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z"
          />
          <path
            fill="#EA4335"
            d="M12 6.01c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"
          />
        </svg>
        เข้าสู่ระบบด้วย Google
      </button>

      {oauthError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {oauthError}
        </p>
      )}

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">
          ลืมรหัสผ่าน
        </Link>
        {registrationEnabled && <Link href="/register" className="text-primary hover:underline">สมัครสมาชิก</Link>}
      </div>
    </form>
  )
}
