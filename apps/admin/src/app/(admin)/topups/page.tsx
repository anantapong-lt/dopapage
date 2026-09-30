'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download, RefreshCw, Search, WalletCards, X } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import type { DateRange } from 'react-day-picker'
import { th } from 'react-day-picker/locale'
import { toast } from 'sonner'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TopupStatus } from '@/constants/topup.constant'
import { SITE_CONFIG } from '@/site.config'
import { formatCoin } from '@/utils/format-coin'

const PAGE_LIMIT = 20
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })
const dateOnly = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' })
const calendarYears = Array.from(
  { length: new Date().getFullYear() - 2000 + 1 },
  (_, index) => String(new Date().getFullYear() - index),
)

const statusLabels: Record<TopupStatus, string> = {
  [TopupStatus.PENDING]: 'รอชำระเงิน',
  [TopupStatus.PAID]: 'ชำระเงินแล้ว',
  [TopupStatus.EXPIRED]: 'หมดอายุ',
  [TopupStatus.FAILED]: 'ไม่สำเร็จ',
}

const statusBadgeClasses: Record<TopupStatus, string> = {
  [TopupStatus.PENDING]: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  [TopupStatus.PAID]: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  [TopupStatus.EXPIRED]: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  [TopupStatus.FAILED]: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return 'เลือกช่วงวันที่'
  if (!range.to) return dateOnly.format(range.from)
  return `${dateOnly.format(range.from)} – ${dateOnly.format(range.to)}`
}

interface Topup {
  id: string
  provider: string
  provider_payment_id: string | null
  requested_amount: string
  base_coins: string
  bonus_coins: string
  credited_coins: string
  status: TopupStatus
  user_display_name: string
  user_username: string
  user_email: string
  user_avatar_url: string | null
  expires_at: string | null
  paid_at: string | null
  created_at: string
}

interface TopupResponse {
  topups: Topup[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export default function TopupsPage() {
  const { accessToken } = useAdminAuth()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<'all' | TopupStatus>('all')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [startCalendarMonth, setStartCalendarMonth] = useState(() => new Date())
  const [endCalendarMonth, setEndCalendarMonth] = useState(() => {
    const current = new Date()
    return new Date(current.getFullYear(), current.getMonth() + 1, 1)
  })
  const [page, setPage] = useState(1)
  const [data, setData] = useState<TopupResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const dateFrom = dateRange?.from ? toDateValue(dateRange.from) : ''
  const dateTo = dateRange?.to ? toDateValue(dateRange.to) : ''

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [appliedSearch, selectedStatus, dateFrom, dateTo])

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_LIMIT),
      status: selectedStatus,
    })
    if (appliedSearch) query.set('search', appliedSearch)
    if (dateFrom) query.set('date_from', dateFrom)
    if (dateTo) query.set('date_to', dateTo)

    setIsLoading(true)
    setError(null)
    void fetch(`${apiUrl}/admin/topups?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as TopupResponse | { message?: string }
        if (!response.ok) throw new Error('message' in body ? body.message : 'ไม่สามารถโหลดรายการเติมเงินได้')
        if (!controller.signal.aborted) setData(body as TopupResponse)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'ไม่สามารถโหลดรายการเติมเงินได้')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [accessToken, appliedSearch, selectedStatus, dateFrom, dateTo, page, reloadKey])

  function clearFilters() {
    setSearch('')
    setAppliedSearch('')
    setSelectedStatus('all')
    setDateRange(undefined)
    setPage(1)
  }

  async function exportFilteredTopups() {
    if (!accessToken || isExporting) return

    setIsExporting(true)
    try {
      const topups: Topup[] = []
      let exportPage = 1
      let totalPages = 1

      do {
        const query = new URLSearchParams({
          page: String(exportPage),
          limit: '100',
          status: selectedStatus,
        })
        const exportSearch = search.trim()
        if (exportSearch) query.set('search', exportSearch)
        if (dateFrom) query.set('date_from', dateFrom)
        if (dateTo) query.set('date_to', dateTo)

        const response = await fetch(`${apiUrl}/admin/topups?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
          cache: 'no-store',
        })
        const body = await response.json() as TopupResponse | { message?: string }
        if (!response.ok) throw new Error('message' in body ? body.message : 'ไม่สามารถส่งออกข้อมูลได้')

        const result = body as TopupResponse
        topups.push(...result.topups)
        totalPages = result.pagination.totalPages
        exportPage += 1
      } while (exportPage <= totalPages)

      const XLSX = await import('xlsx')
      const worksheet = XLSX.utils.json_to_sheet(topups.map((topup) => ({
        'เลขที่รายการ': topup.id,
        'ผู้ใช้': topup.user_display_name,
        'Username': topup.user_username,
        'อีเมล': topup.user_email,
        'ช่องทาง': topup.provider,
        'เลขอ้างอิงผู้ให้บริการ': topup.provider_payment_id ?? '',
        'จำนวนเงิน (บาท)': Number(topup.requested_amount),
        [`${SITE_CONFIG.coinName}พื้นฐาน`]: Number(topup.base_coins),
        [`${SITE_CONFIG.coinName}โบนัส`]: Number(topup.bonus_coins),
        [`${SITE_CONFIG.coinName}ที่ได้รับ`]: Number(topup.credited_coins),
        'สถานะ': statusLabels[topup.status],
        'วันที่สร้างรายการ': dateTime.format(new Date(topup.created_at)),
        'วันที่ชำระเงิน': topup.paid_at ? dateTime.format(new Date(topup.paid_at)) : '',
      })))
      worksheet['!cols'] = [
        { wch: 38 }, { wch: 24 }, { wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 24 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 24 },
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'รายการเติมเงิน')
      XLSX.writeFile(workbook, `รายการเติมเงิน-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`ส่งออก ${topups.length.toLocaleString('th-TH')} รายการแล้ว`)
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : 'ไม่สามารถส่งออกข้อมูลได้')
    } finally {
      setIsExporting(false)
    }
  }

  const hasFilters = Boolean(search || selectedStatus !== 'all' || dateRange?.from)

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">รายการเติมเงิน</h1>
          <p className="mt-1 text-sm text-muted-foreground">ตรวจสอบประวัติการเติมเงินและสถานะการชำระเงินทั้งหมด</p>
        </div>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
          <WalletCards className="size-3.5" />
          {data?.pagination.total ?? 0} รายการ
        </Badge>
      </div>

      <Card>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,0.8fr)_minmax(14rem,1fr)_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="topup-user-search">ค้นหาผู้ใช้</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="topup-user-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ชื่อ, username หรืออีเมล"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>สถานะ</Label>
            <Select<string> value={selectedStatus} onValueChange={(value) => {
              if (value) setSelectedStatus(value as 'all' | TopupStatus)
            }}>
              <SelectTrigger className="w-full">
                <SelectValue>{selectedStatus === 'all' ? 'ทุกสถานะ' : statusLabels[selectedStatus]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสถานะ</SelectItem>
                {Object.values(TopupStatus).map((status) => (
                  <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ช่วงวันที่</Label>
            <Popover>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline" className="w-full justify-start bg-transparent text-left font-normal">
                    <CalendarDays className="size-4" />
                    <span className="truncate">{dateRangeLabel(dateRange)}</span>
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
                <div className="flex flex-col divide-y md:flex-row md:divide-x md:divide-y-0">
                  <div>
                    <div className="flex items-center justify-between gap-3 px-3 pt-3">
                      <span className="text-xs font-medium text-muted-foreground">วันเริ่มต้น</span>
                      <Select value={String(startCalendarMonth.getFullYear())} onValueChange={(value) => {
                        if (value) setStartCalendarMonth((current) => new Date(Number(value), current.getMonth(), 1))
                      }}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{calendarYears.map((year) => <SelectItem key={year} value={year}>{Number(year) + 543}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Calendar
                      locale={th}
                      mode="single"
                      selected={dateRange?.from}
                      onSelect={(date) => {
                        if (!date) return setDateRange(undefined)
                        setDateRange((current) => ({ from: date, to: current?.to && current.to >= date ? current.to : undefined }))
                        setStartCalendarMonth(date)
                      }}
                      month={startCalendarMonth}
                      onMonthChange={setStartCalendarMonth}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3 px-3 pt-3">
                      <span className="text-xs font-medium text-muted-foreground">วันสิ้นสุด</span>
                      <Select value={String(endCalendarMonth.getFullYear())} onValueChange={(value) => {
                        if (value) setEndCalendarMonth((current) => new Date(Number(value), current.getMonth(), 1))
                      }}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>{calendarYears.map((year) => <SelectItem key={year} value={year}>{Number(year) + 543}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Calendar
                      locale={th}
                      mode="single"
                      selected={dateRange?.to}
                      disabled={dateRange?.from ? { before: dateRange.from } : undefined}
                      onSelect={(date) => {
                        if (!date) return
                        setDateRange((current) => current?.from ? { from: current.from, to: date } : { from: date })
                        setEndCalendarMonth(date)
                      }}
                      month={endCalendarMonth}
                      onMonthChange={setEndCalendarMonth}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button type="button" variant="outline" className="whitespace-nowrap bg-transparent px-3" onClick={() => void exportFilteredTopups()} disabled={isExporting}>
            <Download />
            {isExporting ? 'กำลังส่งออก...' : 'Export Excel'}
          </Button>
          <Button type="button" variant="outline" className="whitespace-nowrap bg-transparent px-3" onClick={clearFilters} disabled={!hasFilters}>
            <X />
            ล้างตัวกรอง
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          {error ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-4" variant="outline" onClick={() => setReloadKey((current) => current + 1)}>
                <RefreshCw />
                ลองใหม่
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้ใช้</TableHead>
                    <TableHead>เลขอ้างอิง</TableHead>
                    <TableHead className="text-right">จำนวนเงิน</TableHead>
                    <TableHead className="text-right">{SITE_CONFIG.coinName}ที่ได้รับ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>วันที่สร้างรายการ</TableHead>
                    <TableHead>วันที่ชำระเงิน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && !data ? (
                    Array.from({ length: 8 }, (_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 7 }, (_, cell) => (
                          <TableCell key={cell}><Skeleton className="h-5 w-28" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.topups.length ? (
                    data.topups.map((topup) => (
                      <TableRow key={topup.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {topup.user_avatar_url ? (
                              <img src={topup.user_avatar_url} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                            ) : (
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {topup.user_username.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="max-w-56 truncate font-medium">{topup.user_display_name}</p>
                              <p className="max-w-56 truncate text-xs text-muted-foreground">@{topup.user_username} · {topup.user_email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-xs">{topup.provider_payment_id ?? '-'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{topup.provider}</p>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">฿{formatCoin(topup.requested_amount)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <GiTwoCoins className="size-4 text-amber-500" />
                            {formatCoin(topup.credited_coins)}
                          </span>
                          {Number(topup.bonus_coins) > 0 && <p className="text-xs font-normal text-emerald-600">โบนัส +{formatCoin(topup.bonus_coins)}</p>}
                        </TableCell>
                        <TableCell><Badge className={statusBadgeClasses[topup.status]}>{statusLabels[topup.status]}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{dateTime.format(new Date(topup.created_at))}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{topup.paid_at ? dateTime.format(new Date(topup.paid_at)) : '-'}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-36 text-center text-muted-foreground">ไม่พบรายการเติมเงินตามตัวกรอง</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-sm text-muted-foreground">หน้า {data?.pagination.page ?? 1} จาก {data?.pagination.totalPages ?? 1}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={isLoading || page <= 1} onClick={() => setPage((current) => current - 1)}>
              <ChevronLeft />
              ก่อนหน้า
            </Button>
            <Button size="sm" variant="outline" disabled={isLoading || !data || page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
              ถัดไป
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>
    </main>
  )
}
