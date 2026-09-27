'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v3'
import { Lock, Phone } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconInput, PasswordInput } from './form-inputs'
import { PasswordStrengthIndicator } from './password-strength-indicator'
import { TurnstileWidget } from './turnstile-widget'
import { useAuth } from './auth-provider'
import { registerWithPassword } from '@/controllers/auth.controller'
import { ApiError } from '@/lib/api-client'
import { getApiUrl } from '@/site.config'

const registerSchema = z
  .object({
    u_name: z
      .string()
      .min(3, 'ชื่อผู้ใช้งานต้องมีอย่างน้อย 3 ตัวอักษร')
      .max(30, 'ชื่อผู้ใช้งานต้องไม่เกิน 30 ตัวอักษร'),
    email: z.string().email('อีเมลไม่ถูกต้อง'),
    phone_number: z.string().regex(/^0[689][0-9]{8}$/, 'กรุณากรอกเบอร์มือถือไทย 10 หลัก'),
    password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(72),
    password_confirm: z.string(),
    terms: z.boolean().refine(Boolean, 'กรุณายอมรับข้อตกลงและเงื่อนไขการใช้บริการ'),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'รหัสผ่านไม่ตรงกัน',
    path: ['password_confirm'],
  })

type RegisterValues = z.infer<typeof registerSchema>

type WebsiteAgreement = {
  id: string
  version: number
  content_html: string
}

export function RegisterForm() {
  const router = useRouter()
  const { refresh } = useAuth()
  const [termsOpen, setTermsOpen] = useState(false)
  const [websiteAgreement, setWebsiteAgreement] = useState<WebsiteAgreement | null>(null)
  const [isLoadingAgreement, setIsLoadingAgreement] = useState(true)
  const [agreementError, setAgreementError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const turnstileRequired = process.env.NODE_ENV !== 'development'
  const {
    control,
    register,
    handleSubmit,
    setValue,
    trigger,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), defaultValues: { terms: false } })
  const password = watch('password')
  const termsAccepted = watch('terms')

  useEffect(() => {
    const controller = new AbortController()

    void fetch(getApiUrl('/agreements/website'), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('ไม่สามารถโหลดข้อตกลงและเงื่อนไขได้')
        const body = await response.json() as { agreement: WebsiteAgreement | null }
        if (!controller.signal.aborted) {
          setWebsiteAgreement(body.agreement)
          setAgreementError(null)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setWebsiteAgreement(null)
          setAgreementError('ไม่สามารถโหลดข้อตกลงและเงื่อนไขได้')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingAgreement(false)
      })

    return () => controller.abort()
  }, [])

  function fillMockRegistration() {
    const suffix = Date.now().toString().slice(-6)
    setValue('u_name', `demo_${suffix}`, { shouldValidate: true })
    setValue('email', `demo.${suffix}@example.test`, { shouldValidate: true })
    setValue('phone_number', '0900000000', { shouldValidate: true })
    setValue('password', 'DemoPass123!', { shouldValidate: true })
    setValue('password_confirm', 'DemoPass123!', { shouldValidate: true })
    setValue('terms', true, { shouldValidate: true })
    clearErrors()
  }

  async function onSubmit(values: RegisterValues) {
    clearErrors('root')
    try {
      await registerWithPassword({
        username: values.u_name,
        email: values.email,
        phone_number: values.phone_number,
        password: values.password,
        turnstile_token: turnstileToken ?? undefined,
      })
      if (!(await refresh())) throw new Error('ไม่สามารถเริ่มเซสชันหลังสมัครสมาชิกได้')
      router.replace('/')
    } catch (error) {
      setError('root', { message: error instanceof ApiError ? error.message : 'ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง' })
    } finally {
      setTurnstileToken(null)
      setTurnstileKey((value) => value + 1)
    }
  }

  async function registerWithGoogle() {
    if (!(await trigger('terms'))) return
    window.location.assign(getApiUrl('/auth/google/register'))
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" aria-busy={isSubmitting}>
        {process.env.NODE_ENV === 'development' && (
          <div className="flex justify-end gap-3 text-xs">
            <button type="button" onClick={fillMockRegistration} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">กรอกข้อมูลตัวอย่าง</button>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium">ชื่อผู้ใช้งาน</label>
          <IconInput autoComplete="username" {...register('u_name')} />
          {errors.u_name && <p className="mt-1 text-xs text-destructive">{errors.u_name.message}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">อีเมล</label>
          <IconInput type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">เบอร์มือถือ</label>
          <IconInput
            icon={<Phone className="size-4" />}
            placeholder="0812345678"
            inputMode="tel"
            autoComplete="tel"
            {...register('phone_number')}
          />
          {errors.phone_number && <p className="mt-1 text-xs text-destructive">{errors.phone_number.message}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">รหัสผ่าน</label>
          <PasswordInput icon={<Lock className="size-4" />} autoComplete="new-password" {...register('password')} />
          <PasswordStrengthIndicator password={password} />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">ยืนยันรหัสผ่าน</label>
          <PasswordInput
            icon={<Lock className="size-4" />}
            autoComplete="new-password"
            {...register('password_confirm')}
          />
          {errors.password_confirm && (
            <p className="mt-1 text-xs text-destructive">{errors.password_confirm.message}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5 text-sm">
          <Controller
            name="terms"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="accept-terms"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <span>ยอมรับ</span>
          <button type="button" onClick={() => setTermsOpen(true)} className="text-blue-600 underline">
            ข้อตกลงและเงื่อนไข
          </button>
        </div>
        {errors.terms && <p className="-mt-2 text-center text-xs text-destructive">{errors.terms.message}</p>}
        <TurnstileWidget key={turnstileKey} action="register" onTokenChange={setTurnstileToken} />
        <button
          type="submit"
          disabled={!termsAccepted || isSubmitting || (turnstileRequired && !turnstileToken)}
          className="h-11 w-full rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
        </button>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">หรือ</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={() => void registerWithGoogle()}
          disabled={!termsAccepted}
          className="h-11 w-full rounded-lg border border-border bg-background px-4 text-base font-medium hover:bg-muted disabled:opacity-60"
        >
          สมัครสมาชิกด้วย Google
        </button>
        {errors.root?.message && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {errors.root.message}
          </p>
        )}
        <div className="flex justify-end">
          <Link href="/login" className="text-sm text-primary hover:underline">
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </form>
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-h-[85vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>ข้อตกลงและเงื่อนไขการใช้บริการ</DialogTitle>
            <DialogDescription className="sr-only">
              รายละเอียดข้อตกลงและเงื่อนไขการใช้บริการของเว็บไซต์
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-background p-4 sm:p-6">
            {isLoadingAgreement ? (
              <div className="space-y-3" aria-label="กำลังโหลดข้อตกลงและเงื่อนไข">
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            ) : agreementError ? (
              <p className="py-10 text-center text-sm text-destructive">{agreementError}</p>
            ) : websiteAgreement ? (
              <div
                className="break-words text-sm leading-7 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/35 [&_blockquote]:pl-4 [&_h1]:my-5 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:my-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-3 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: websiteAgreement.content_html }}
              />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                ยังไม่มีข้อตกลงและเงื่อนไขที่เปิดใช้งาน
              </p>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTermsOpen(false)}
              className="h-10 rounded-lg bg-primary px-4 text-primary-foreground"
            >
              ปิด
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
