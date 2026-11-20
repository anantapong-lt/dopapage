'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, BookOpen, ChevronLeft, ChevronRight, HistoryIcon, MoreHorizontal, RefreshCw } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getChapterPurchaseHistory } from '@/controllers/chapter-purchase.controller'
import { getTopupHistory } from '@/controllers/topup.controller'
import type { ChapterPurchaseHistoryResponse } from '@/interface/chapter-purchase.interface'
import type { TopupHistoryResponse, TopupStatus } from '@/interface/topup.interface'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'

const PAGE_LIMIT = 10
const amountFormat = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
})

type TabName = 'topup' | 'purchase'

function displayAmount(amount: string) {
  return amountFormat.format(Number(amount))
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const items: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  if (start > 2) items.push('ellipsis-start')
  for (let item = start; item <= end; item += 1) items.push(item)
  if (end < totalPages - 1) items.push('ellipsis-end')
  items.push(totalPages)
  return items
}

function topupStatus(status: TopupStatus) {
  if (status === 'paid') return { label: 'สำเร็จ', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
  if (status === 'pending') return { label: 'รอชำระเงิน', className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400' }
  if (status === 'expired') return { label: 'หมดอายุ', className: 'border-muted-foreground/20 bg-muted text-muted-foreground' }
  return { label: 'ไม่สำเร็จ', className: 'border-destructive/20 bg-destructive/10 text-destructive' }
}

function TableLoading({ columns }: { columns: number }) {
  return (
    <TableBody>
      {Array.from({ length: 4 }, (_, index) => (
        <TableRow key={index}>
          {Array.from({ length: columns }, (_, cell) => (
            <TableCell key={cell} className="px-5 py-4"><Skeleton className="h-5 w-full min-w-20" /></TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  )
}

function Pagination({ pagination, onPageChange, isLoading }: {
  pagination: { page: number; total: number; totalPages: number; limit: number }
  onPageChange: (page: number) => void
  isLoading: boolean
}) {
  if (pagination.totalPages <= 1) return null
  const first = (pagination.page - 1) * pagination.limit + 1
  const last = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="flex flex-col gap-3 border-t px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>แสดง {first}–{last} จาก {pagination.total} รายการ</span>
      <div className="flex items-center justify-between gap-1 sm:justify-end" aria-label="เลือกหน้าประวัติทำรายการ">
        <Button size="sm" variant="outline" disabled={pagination.page <= 1 || isLoading} onClick={() => onPageChange(pagination.page - 1)} aria-label="หน้าก่อนหน้า">
          <ChevronLeft /><span className="hidden sm:inline">ก่อนหน้า</span>
        </Button>
        <span className="text-xs tabular-nums sm:hidden">หน้า {pagination.page} / {pagination.totalPages}</span>
        <div className="hidden items-center gap-1 sm:flex">
          {getPaginationItems(pagination.page, pagination.totalPages).map((item) => typeof item === 'number' ? (
            <Button key={item} size="sm" variant={item === pagination.page ? 'default' : 'outline'} className="size-8 px-0 tabular-nums" disabled={isLoading} onClick={() => onPageChange(item)} aria-current={item === pagination.page ? 'page' : undefined}>{item}</Button>
          ) : <span key={item} className="flex size-8 items-center justify-center" aria-hidden="true"><MoreHorizontal className="size-4" /></span>)}
        </div>
        <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => onPageChange(pagination.page + 1)} aria-label="หน้าถัดไป">
          <span className="hidden sm:inline">ถัดไป</span><ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function TransactionsHistory() {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const { accessToken, status } = useAuth()
  const [activeTab, setActiveTab] = useState<TabName>('topup')
  const [topupPage, setTopupPage] = useState(1)
  const [purchasePage, setPurchasePage] = useState(1)
  const [topups, setTopups] = useState<TopupHistoryResponse | null>(null)
  const [purchases, setPurchases] = useState<ChapterPurchaseHistoryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load() {
    if (!accessToken) return
    setIsLoading(true)
    setLoadError(null)
    try {
      if (activeTab === 'topup') setTopups(await getTopupHistory(topupPage, PAGE_LIMIT, accessToken))
      else setPurchases(await getChapterPurchaseHistory(purchasePage, PAGE_LIMIT, accessToken))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'ไม่สามารถโหลดประวัติทำรายการได้')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!accessToken) {
      if (status !== 'loading') setIsLoading(false)
      return
    }
    void load()
    // The selected tab and its page determine the API request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeTab, topupPage, purchasePage, status])

  const currentData = activeTab === 'topup' ? topups : purchases

  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-10">
      <section className="border-b border-border pb-5 sm:pb-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><HistoryIcon className="size-5" /></span>
          <div>
            <h1 className="readji-page-title text-xl sm:text-2xl md:text-3xl">ประวัติทำรายการ</h1>
            <p className="mt-1 text-sm text-muted-foreground">ตรวจสอบรายการเติมเงินและการซื้อตอนของคุณ</p>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabName)} className="mt-5 gap-4 sm:mt-7">
        <TabsList aria-label="ประเภทประวัติทำรายการ" className="h-11 w-full gap-1 bg-muted/60 p-1 sm:w-auto">
          <TabsTrigger value="topup" className="gap-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><GiTwoCoins className="size-4" />ธุรกรรมเติมเงิน</TabsTrigger>
          <TabsTrigger value="purchase" className="gap-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><BookOpen className="size-4" />ประวัติซื้อตอน</TabsTrigger>
        </TabsList>

        {loadError && !currentData ? (
          <div className="readji-surface flex min-h-64 flex-col items-center justify-center rounded-2xl p-6 text-center">
            <AlertCircle className="size-8 text-destructive" /><p className="mt-3 font-semibold">{loadError}</p>
            <Button className="mt-4" onClick={() => void load()}><RefreshCw />ลองใหม่</Button>
          </div>
        ) : (
          <>
            <TabsContent value="topup" className="m-0">
              <section className="readji-surface overflow-hidden rounded-2xl bg-card">
                <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-bold">ธุรกรรมเติมเงิน</h2><p className="mt-0.5 text-sm text-muted-foreground">{topups?.pagination.total ?? 0} รายการ</p></div>{isLoading && activeTab === 'topup' && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}</div>
                <div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead className="h-12 px-5">วันที่ทำรายการ</TableHead><TableHead className="h-12 px-5 text-right">จำนวนเงิน</TableHead><TableHead className="h-12 px-5 text-right">{SITE_CONFIG.coinName}ที่ได้รับ</TableHead><TableHead className="h-12 px-5 text-center">สถานะ</TableHead></TableRow></TableHeader>
                  {isLoading && !topups ? <TableLoading columns={4} /> : <TableBody>{topups?.transactions.length ? topups.transactions.map((transaction) => { const transactionStatus = topupStatus(transaction.status); return <TableRow key={transaction.id} className="hover:bg-muted/40"><TableCell className="px-5 py-4 font-medium">{dateFormat.format(new Date(transaction.created_at))}</TableCell><TableCell className="px-5 py-4 text-right tabular-nums">{displayAmount(transaction.requested_amount)} บาท</TableCell><TableCell className="px-5 py-4 text-right"><span className="inline-flex items-center gap-1 font-bold tabular-nums text-primary"><GiTwoCoins className="size-4 text-amber-500" />{displayAmount(transaction.credited_coins)}</span></TableCell><TableCell className="px-5 py-4 text-center"><Badge variant="outline" className={transactionStatus.className}>{transactionStatus.label}</Badge></TableCell></TableRow> }) : <TableRow><TableCell colSpan={4} className="h-40 px-5 text-center text-muted-foreground">ยังไม่มีประวัติการเติมเงิน</TableCell></TableRow>}</TableBody>}</Table></div>
                {topups && <Pagination pagination={topups.pagination} isLoading={isLoading && activeTab === 'topup'} onPageChange={setTopupPage} />}
              </section>
            </TabsContent>

            <TabsContent value="purchase" className="m-0">
              <section className="readji-surface overflow-hidden rounded-2xl bg-card">
                <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-bold">ประวัติซื้อตอน</h2><p className="mt-0.5 text-sm text-muted-foreground">{purchases?.pagination.total ?? 0} รายการ</p></div>{isLoading && activeTab === 'purchase' && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}</div>
                <div className="overflow-x-auto"><Table className="min-w-[580px] sm:min-w-[820px]"><TableHeader><TableRow><TableHead className="h-12 w-16 px-3 sm:w-auto sm:px-5"><span className="sr-only sm:not-sr-only">เนื้อหา</span></TableHead><TableHead className="h-12 px-3 sm:px-5">ตอน</TableHead><TableHead className="h-12 px-3 text-right sm:px-5">ราคา</TableHead><TableHead className="h-12 px-3 sm:px-5">วันที่ซื้อ</TableHead></TableRow></TableHeader>
                  {isLoading && !purchases ? <TableLoading columns={4} /> : <TableBody>{purchases?.purchases.length ? purchases.purchases.map((purchase) => {
                    const chapterUrl = `/content/${encodeURIComponent(purchase.story_slug)}/${encodeURIComponent(String(Number(purchase.chapter_number)))}`
                    return <TableRow key={purchase.id} className="hover:bg-muted/40"><TableCell className="w-16 px-3 py-3 sm:w-auto sm:px-5"><Link href={chapterUrl} className="flex min-w-0 items-center gap-3 hover:text-primary sm:min-w-56"><span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{purchase.cover_url ? <img src={purchase.cover_url} alt="" className="size-full object-cover" /> : <BookOpen className="size-4 text-muted-foreground" />}</span><span className="hidden max-w-60 truncate font-medium sm:inline">{purchase.story_title}</span></Link></TableCell><TableCell className="px-3 py-3 sm:px-5"><Link href={chapterUrl} className="block rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="font-medium">ตอนที่ {Number(purchase.chapter_number)}</p><p className="max-w-40 truncate text-sm text-muted-foreground sm:max-w-48">{purchase.chapter_title}</p></Link></TableCell><TableCell className="px-3 py-3 text-right sm:px-5"><span className="inline-flex items-center gap-1 font-bold tabular-nums text-primary"><GiTwoCoins className="size-4 text-amber-500" />{displayAmount(purchase.price)}</span></TableCell><TableCell className="px-3 py-3 text-sm text-muted-foreground sm:px-5">{dateFormat.format(new Date(purchase.purchased_at))}</TableCell></TableRow>
                  }) : <TableRow><TableCell colSpan={4} className="h-40 px-5 text-center text-muted-foreground">ยังไม่มีประวัติการซื้อตอน</TableCell></TableRow>}</TableBody>}</Table></div>
                {purchases && <Pagination pagination={purchases.pagination} isLoading={isLoading && activeTab === 'purchase'} onPageChange={setPurchasePage} />}
              </section>
            </TabsContent>
          </>
        )}
      </Tabs>
    </main>
  )
}
