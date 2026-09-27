'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { TurnstileWidget } from '@/components/turnstile-widget'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdminLoginPage() {
  const router = useRouter()
  const { login, status } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const requiresTurnstile = process.env.NODE_ENV !== 'development'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await login(email, password, turnstileToken ?? undefined)
      router.replace('/dashboard')
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setIsSubmitting(false)
      setTurnstileToken(null)
      setTurnstileKey((current) => current + 1)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center px-6 pt-8 text-center">
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <CardTitle className="text-2xl">เข้าสู่ระบบ</CardTitle>
          <CardDescription>Dopapage Admin Control Center</CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-8">
          <form className="grid gap-4" onSubmit={handleSubmit} aria-busy={isSubmitting || status === 'loading'}>
            <div className="grid gap-2">
              <Label htmlFor="email">อีเมล</Label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <Mail className="size-4 text-muted-foreground" />
                <Input
                  id="email"
                  className="h-auto border-0 px-0 shadow-none focus-visible:ring-0"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@Dopapage.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">รหัสผ่าน</Label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <LockKeyhole className="size-4 text-muted-foreground" />
                <Input
                  id="password"
                  className="h-auto border-0 px-0 shadow-none focus-visible:ring-0"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="กรอกรหัสผ่าน"
                  autoComplete="current-password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            <TurnstileWidget key={turnstileKey} onTokenChange={setTurnstileToken} />
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button
              className="mt-2 w-full"
              size="lg"
              type="submit"
              disabled={isSubmitting || status === 'loading' || (requiresTurnstile && !turnstileToken)}
            >
              {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
