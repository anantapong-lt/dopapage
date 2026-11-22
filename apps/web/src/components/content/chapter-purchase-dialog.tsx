'use client'

import Image from 'next/image'
import { LoaderCircle, ShoppingCart, Sparkles, WalletCards } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { LoginRequiredDialog } from '@/components/auth/login-required-dialog'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { purchaseChapters } from '@/controllers/chapter-purchase.controller'
import type { PublicChapter } from '@/interface/content.interface'
import { ApiError } from '@/lib/api-client'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'
import { formatChapterNumber } from '@/utils/chapter-number.util'

function formatCoins(value: number) {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function ChapterPurchaseDialog({
  chapters,
  storyTitle,
  coverUrl,
  open,
  onOpenChange,
  onPurchased,
}: {
  chapters: PublicChapter[]
  storyTitle: string
  coverUrl: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPurchased: (chapterIds: string[]) => void
}) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const router = useRouter()
  const { accessToken, refresh, status, user } = useAuth()
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoginRequiredDialogOpen, setIsLoginRequiredDialogOpen] = useState(false)
  const balance = Number(user?.balance ?? 0)
  const price = chapters.reduce((total, chapter) => total + Number(chapter.price), 0)
  const remainingBalance = balance - price
  const hasEnoughBalance = balance >= price

  function handleOpenChange(nextOpen: boolean) {
    if (isPurchasing) return
    if (!nextOpen) setErrorMessage(null)
    onOpenChange(nextOpen)
  }

  async function confirmPurchase() {
    if (chapters.length === 0) return
    if (status !== 'authenticated' || !accessToken) {
      setIsLoginRequiredDialogOpen(true)
      return
    }
    if (!hasEnoughBalance || isPurchasing) return

    setIsPurchasing(true)
    setErrorMessage(null)
    try {
      const result = await purchaseChapters(
        chapters.map((chapter) => chapter.id),
        accessToken,
      )
      await refresh()
      onPurchased(result.purchases.map((purchase) => purchase.chapter_id))
      onOpenChange(false)
      toast.success(
        chapters.length === 1
          ? 'ซื้อตอนสำเร็จแล้ว'
          : `ซื้อ ${chapters.length.toLocaleString('th-TH')} ตอนสำเร็จแล้ว`,
      )
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'ไม่สามารถซื้อตอนได้ กรุณาลองใหม่อีกครั้ง',
      )
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : 'ไม่สามารถซื้อตอนได้ กรุณาลองใหม่อีกครั้ง',
      )
    } finally {
      setIsPurchasing(false)
    }
  }

  function handlePrimaryAction() {
    if (status === 'authenticated' && !hasEnoughBalance) {
      router.push('/topup')
      return
    }

    void confirmPurchase()
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isPurchasing}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShoppingCart className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="text-lg font-extrabold">ยืนยันการซื้อตอน</DialogTitle>
              <DialogDescription className="mt-1">
                กรุณาตรวจสอบรายละเอียดก่อนยืนยันการซื้อ
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {chapters.length > 0 ? (
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div className="flex gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              {coverUrl ? (
                <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={coverUrl}
                    alt={`ปกเรื่อง ${storyTitle}`}
                    fill
                    sizes="64px"
                    quality={85}
                    className="object-cover"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1 py-0.5">
                <p className="line-clamp-2 font-bold leading-6 text-foreground">{storyTitle}</p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  เลือกซื้อ {chapters.length.toLocaleString('th-TH')} ตอน
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-extrabold text-primary">
                  <GiTwoCoins className="size-5 text-amber-500" aria-hidden="true" />
                  {formatCoins(price)} {SITE_CONFIG.coinName}
                </p>
              </div>
            </div>

            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-2">
              {chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    ตอนที่ {formatChapterNumber(chapter.chapter_number)}: {chapter.title}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-foreground">
                    {formatCoins(Number(chapter.price))}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/65 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <WalletCards className="size-4" aria-hidden="true" />
                  ยอด{SITE_CONFIG.coinName}ปัจจุบัน
                </span>
                <span className="font-bold tabular-nums">{formatCoins(balance)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/65 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShoppingCart className="size-4" aria-hidden="true" />
                  ราคาตอนนี้
                </span>
                <span className="font-bold tabular-nums text-primary">-{formatCoins(price)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-primary/10 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Sparkles className="size-4" aria-hidden="true" />
                  ยอดคงเหลือหลังซื้อ
                </span>
                <span className={`font-extrabold tabular-nums ${remainingBalance < 0 ? 'text-destructive' : 'text-primary'}`}>
                  {formatCoins(remainingBalance)}
                </span>
              </div>
            </div>

            {status === 'unauthenticated' ? (
              <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                กรุณาเข้าสู่ระบบก่อนซื้อตอน
              </p>
            ) : !hasEnoughBalance && status === 'authenticated' ? (
              <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                {SITE_CONFIG.coinName}ไม่เพียงพอสำหรับซื้อตอนนี้
              </p>
            ) : null}

            {errorMessage ? (
              <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="m-0 shrink-0 rounded-none px-5 py-4 sm:px-6">
          <DialogClose asChild>
            <button
              type="button"
              disabled={isPurchasing}
              className="h-10 cursor-pointer rounded-xl border border-border bg-card px-5 font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-60"
            >
              ยกเลิก
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={isPurchasing || status === 'loading'}
            onClick={handlePrimaryAction}
            className="flex h-10 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
          >
            {isPurchasing ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : status === 'authenticated' && !hasEnoughBalance ? (
              <GiTwoCoins className="size-4" aria-hidden="true" />
            ) : (
              <ShoppingCart className="size-4" aria-hidden="true" />
            )}
            {status === 'unauthenticated'
              ? 'เข้าสู่ระบบเพื่อซื้อ'
              : status === 'authenticated' && !hasEnoughBalance
                ? `เติม${SITE_CONFIG.coinName}เพิ่ม`
                : 'ยืนยันการซื้อ'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <LoginRequiredDialog
      open={isLoginRequiredDialogOpen}
      onOpenChange={setIsLoginRequiredDialogOpen}
    />
    </>
  )
}
