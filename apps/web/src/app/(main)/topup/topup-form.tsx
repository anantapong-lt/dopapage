'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, CircleAlert, CircleCheckBig, Download, LoaderCircle, QrCode, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createTopup } from '@/controllers/topup.controller'
import type { CreateTopupResponse, TopupPackage, TopupTransaction } from '@/interface/topup.interface'
import { ApiError } from '@/lib/api-client'
import { getApiUrl, SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'

function formatNumber(value: number) {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function qrImageSource(base64: string) {
  return base64.startsWith('data:image/')
    ? base64
    : `data:image/png;base64,${base64}`
}

function remainingSeconds(expiresAt: string | null, fallback: number) {
  if (!expiresAt) return Math.max(fallback, 0)
  return Math.max(Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000), 0)
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function saveQrCode(base64: string, transactionId: string) {
  const link = document.createElement('a')
  link.href = qrImageSource(base64)
  link.download = `topup-${transactionId}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function topupSocketUrl(topupId: string) {
  const url = new URL(getApiUrl(`/topups/${encodeURIComponent(topupId)}/events`))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

interface TopupSocketMessage {
  type: 'topup.updated'
  transaction: TopupTransaction
}

export function TopupForm({ packages }: { packages: TopupPackage[] }) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const { accessToken, refresh, status } = useAuth()
  const firstPackageAmount = packages[0]?.amount ?? '50'
  const [amount, setAmount] = useState(Number(firstPackageAmount))
  const [customAmount, setCustomAmount] = useState(firstPackageAmount)
  const [createdTopup, setCreatedTopup] = useState<CreateTopupResponse | null>(null)
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [closeCountdown, setCloseCountdown] = useState(5)
  const [closeProgress, setCloseProgress] = useState(100)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const amountIsValid = Number.isInteger(amount) && amount >= 1 && amount <= 3000
  const topupId = createdTopup?.transaction.id
  const topupStatus = createdTopup?.transaction.status
  const topupExpiresAt = createdTopup?.transaction.expires_at ?? null
  const paymentTimeout = createdTopup?.payment.time_out ?? 0
  const isPaid = topupStatus === 'paid'
  const isExpired = topupStatus === 'expired'
  const selectedPackage = packages.find((item) => Number(item.amount) === amount && Number(customAmount) === Number(item.amount))
  const bonus = selectedPackage ? Number(selectedPackage.bonus) : 0

  useEffect(() => {
    if (!topupId) return

    function updateCountdown() {
      setCountdown(remainingSeconds(topupExpiresAt, paymentTimeout))
    }

    updateCountdown()
    const timer = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timer)
  }, [paymentTimeout, topupExpiresAt, topupId])

  useEffect(() => {
    if (!isPaid || !topupId) return

    const closeAfterMs = 5_000
    const startedAt = Date.now()
    setCloseCountdown(5)
    setCloseProgress(100)

    const progressTimer = window.setInterval(() => {
      const remainingMs = Math.max(closeAfterMs - (Date.now() - startedAt), 0)
      setCloseCountdown(Math.ceil(remainingMs / 1_000))
      setCloseProgress((remainingMs / closeAfterMs) * 100)
    }, 100)
    const closeTimer = window.setTimeout(() => setIsQrDialogOpen(false), 5_000)
    return () => {
      window.clearInterval(progressTimer)
      window.clearTimeout(closeTimer)
    }
  }, [isPaid, topupId])

  useEffect(() => {
    if (
      !topupId
      || topupStatus !== 'pending'
      || status !== 'authenticated'
    ) return

    const socketTopupId = topupId
    let cancelled = false
    let reconnectTimer: number | undefined
    let socket: WebSocket | null = null

    function connect() {
      socket = new WebSocket(topupSocketUrl(socketTopupId))

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as TopupSocketMessage
          if (
            message.type !== 'topup.updated'
            || message.transaction.id !== socketTopupId
          ) return

          setCreatedTopup((current) => current
            ? { ...current, transaction: message.transaction }
            : current)

          if (message.transaction.status === 'paid') void refresh()
        } catch {
          // Ignore malformed messages and keep the connection open.
        }
      }

      socket.onclose = () => {
        if (!cancelled) reconnectTimer = window.setTimeout(connect, 1_500)
      }

      socket.onerror = () => socket?.close()
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [refresh, status, topupId, topupStatus])

  function selectAmount(value: number) {
    if (isCreating || createdTopup) return
    setAmount(value)
    setCustomAmount(String(value))
    setErrorMessage(null)
  }

  function changeCustomAmount(value: string) {
    if (isCreating || createdTopup) return
    const digits = value.replace(/\D/g, '')
    setCustomAmount(digits)
    setAmount(Number(digits) || 0)
    setErrorMessage(null)
  }

  async function handleCreateTopup() {
    if (!amountIsValid || isCreating) return
    if (status !== 'authenticated' || !accessToken) {
      setErrorMessage('กรุณาเข้าสู่ระบบอีกครั้ง')
      return
    }

    setIsCreating(true)
    setErrorMessage(null)
    try {
      const result = await createTopup(amount, accessToken)
      setCreatedTopup(result)
      setCountdown(remainingSeconds(result.transaction.expires_at, result.payment.time_out))
      setIsQrDialogOpen(true)
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'ไม่สามารถสร้างคิวอาร์โค้ดได้ กรุณาลองใหม่อีกครั้ง',
      )
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="mt-5 space-y-3 sm:mt-7 sm:space-y-4">
      <section className="readji-surface rounded-xl p-3 sm:rounded-2xl sm:p-5" aria-labelledby="payment-method-heading">
        <h2 id="payment-method-heading" className="text-sm font-bold text-foreground sm:text-base">
          เลือกช่องทางชำระเงิน
        </h2>

        <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-primary bg-accent/45 p-3 sm:mt-4 sm:p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary sm:size-12">
            <QrCode className="size-6 sm:size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-foreground sm:text-base">คิวอาร์โค้ด</p>
              <BadgeCheck className="size-4 fill-primary text-primary-foreground" />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">ชำระผ่านแอปธนาคาร</p>
          </div>
        </div>
      </section>

      <section className="readji-surface rounded-xl p-3 sm:rounded-2xl sm:p-5" aria-labelledby="topup-amount-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="topup-amount-heading" className="text-sm font-bold text-foreground sm:text-base">จำนวนเงิน</h2>
          <span className="text-[10px] text-muted-foreground sm:text-xs">1 บาท = 1 {SITE_CONFIG.coinName}</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          {packages.map((topupPackage) => {
            const value = Number(topupPackage.amount)
            const selected = amount === value && Number(customAmount) === value

            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => selectAmount(value)}
                disabled={isCreating || Boolean(createdTopup)}
                className={`flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold tabular-nums transition-colors sm:py-2.5 sm:text-sm ${
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-secondary text-secondary-foreground hover:border-primary/50 hover:bg-accent'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span>{formatNumber(value)} บาท</span>
                {Number(topupPackage.bonus) > 0 && <span className="mt-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">โบนัส +{formatNumber(Number(topupPackage.bonus))}</span>}
              </button>
            )
          })}
        </div>

        <label className="mt-3 block rounded-lg border border-border bg-background/70 px-3 py-2 sm:mt-4 sm:px-4 sm:py-3">
          <span className="block text-[10px] text-muted-foreground sm:text-xs">ระบุจำนวนเงินด้วยตัวเอง</span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">THB</span>
            <input
              type="text"
              inputMode="numeric"
              value={customAmount}
              onChange={(event) => changeCustomAmount(event.target.value)}
              disabled={isCreating || Boolean(createdTopup)}
              aria-label="จำนวนเงินที่ต้องการเติม"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-foreground outline-none disabled:cursor-not-allowed sm:text-base"
            />
          </span>
        </label>

        <div className="mt-3 rounded-lg border border-border p-3 text-xs sm:mt-4 sm:p-4 sm:text-sm">
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-muted-foreground">{SITE_CONFIG.coinName}พื้นฐาน</span>
            <span className="font-semibold tabular-nums text-foreground">{formatNumber(amount)} {SITE_CONFIG.coinName}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-muted-foreground">โบนัส</span>
            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+{formatNumber(bonus)} {SITE_CONFIG.coinName}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-3">
            <span className="font-bold text-foreground">รวมที่จะได้รับ</span>
            <span className="text-base font-bold tabular-nums text-primary sm:text-lg">
              {formatNumber(amount + bonus)} {SITE_CONFIG.coinName}
            </span>
          </div>
        </div>

        {!amountIsValid && (
          <p className="mt-2 text-xs font-medium text-destructive">กรุณาระบุจำนวนเต็มตั้งแต่ 1 ถึง 3,000 บาท</p>
        )}

        {errorMessage && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive sm:text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        )}

        {!createdTopup ? (
          <button
            type="button"
            onClick={() => void handleCreateTopup()}
            disabled={!amountIsValid || isCreating || status !== 'authenticated'}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground sm:mt-4 sm:text-sm"
          >
            {isCreating && <LoaderCircle className="size-4 animate-spin" />}
            {isCreating
              ? 'กำลังสร้างคิวอาร์โค้ด...'
              : status !== 'authenticated'
                ? 'กรุณาเข้าสู่ระบบ'
                : 'สร้างคิวอาร์โค้ดชำระเงิน'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsQrDialogOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:mt-4 sm:text-sm"
          >
            <QrCode className="size-4" />
            เปิดคิวอาร์โค้ดชำระเงิน
          </button>
        )}

      </section>

      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        {createdTopup && (
          <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-3 sm:max-w-md sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <DialogHeader className="gap-0.5 text-left">
                <DialogTitle className="text-sm font-bold sm:text-base">สแกนเพื่อชำระเงิน</DialogTitle>
                <DialogDescription className="text-[10px] sm:text-xs">กรุณาชำระยอดตามคิวอาร์โค้ดให้ตรงทุกหลัก</DialogDescription>
              </DialogHeader>
              <div className={`mr-7 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                isPaid
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : countdown > 0 && !isExpired
                    ? 'bg-accent text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {isPaid ? 'ชำระเงินแล้ว' : countdown > 0 && !isExpired ? formatCountdown(countdown) : 'หมดเวลา'}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div className={`mx-auto flex size-64 max-h-[52dvh] max-w-full items-center justify-center rounded-xl border p-2 shadow-sm sm:size-72 ${
                isPaid
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-border bg-white'
              }`}>
                {isPaid ? (
                  <div className="flex size-32 animate-in items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 duration-500 zoom-in-50 fade-in sm:size-36">
                    <CircleCheckBig className="size-20 animate-in duration-700 zoom-in-50 sm:size-24" strokeWidth={2.25} />
                  </div>
                ) : (
                  <img
                    src={qrImageSource(createdTopup.payment.qr_image_base64)}
                    alt="คิวอาร์โค้ดสำหรับชำระเงิน"
                    className="size-full object-contain"
                  />
                )}
              </div>

              {isPaid && (
                <div className="space-y-1.5" aria-live="polite">
                  <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <span>ชำระเงินสำเร็จ</span>
                    <span className="tabular-nums">ปิดใน {closeCountdown} วินาที</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="เวลาที่เหลือก่อนปิดหน้าต่าง"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(closeProgress)}
                    className="h-1.5 overflow-hidden rounded-full bg-emerald-500/15"
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-100 ease-linear"
                      style={{ width: `${closeProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {!isPaid && (
                <button
                  type="button"
                  onClick={() => saveQrCode(
                    createdTopup.payment.qr_image_base64,
                    createdTopup.transaction.id,
                  )}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent sm:hidden"
                >
                  <Download className="size-4" />
                  บันทึก QR Code
                </button>
              )}

              <div className="rounded-xl border border-border bg-background/70 p-4 text-center">
                <p className="text-xs text-muted-foreground">ยอดที่ต้องชำระ</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-primary sm:text-3xl">
                  ฿{(createdTopup.payment.amount_check_satang / 100).toLocaleString('th-TH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <dl className="mt-4 space-y-2 border-t border-border pt-3 text-left text-xs sm:text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">เลขที่รายการ</dt>
                    <dd className="max-w-48 truncate font-medium text-foreground" title={createdTopup.transaction.id}>
                      {createdTopup.transaction.id}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">จะได้รับ</dt>
                    <dd className="font-semibold text-foreground">
                      {formatNumber(Number(createdTopup.transaction.credited_coins))} {SITE_CONFIG.coinName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">สถานะ</dt>
                    <dd className={`font-semibold ${
                      isPaid
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isExpired
                          ? 'text-muted-foreground'
                          : 'text-primary'
                    }`}>
                      {isPaid ? 'ชำระเงินสำเร็จ' : isExpired ? 'หมดเวลาชำระเงิน' : 'รอชำระเงิน'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
