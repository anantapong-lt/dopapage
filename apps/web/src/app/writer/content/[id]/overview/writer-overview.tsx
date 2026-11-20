'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, BookOpenIcon, EyeIcon } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getWriterOverview } from '@/controllers/writer.controller'
import type { OverviewPeriod, WriterOverview as OverviewData } from '@/interface/writer-overview.interface'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'

const periods: { value: OverviewPeriod; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: 'this-week', label: 'สัปดาห์นี้' },
  { value: 'this-month', label: 'เดือนนี้' },
]
const countFormat = new Intl.NumberFormat('th-TH')
const salesFormat = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const overviewCache = new Map<string, OverviewData>()
const overviewRequests = new Map<string, Promise<OverviewData>>()

function loadOverview(key: string, contentId: string, period: OverviewPeriod, accessToken: string) {
  const pending = overviewRequests.get(key)
  if (pending) return pending

  const request = getWriterOverview(contentId, period, accessToken)
    .then((result) => {
      overviewCache.set(key, result)
      return result
    })
    .finally(() => overviewRequests.delete(key))
  overviewRequests.set(key, request)
  return request
}

function PurchaseChartSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลดข้อมูลการซื้อ">
      <span className="sr-only">กำลังโหลดข้อมูลการซื้อ</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="my-4 grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="rounded-lg bg-muted/50 p-3">
              <div className="h-4 w-40 max-w-full rounded bg-chart-2/15" />
              <div className="mt-1 h-7 w-28 rounded bg-chart-2/20" />
            </div>
          ))}
        </div>
        <div className="h-60 w-full sm:h-64">
          <svg viewBox="0 0 800 280" preserveAspectRatio="none" className="h-50 w-full text-chart-2 sm:h-54" focusable="false">
            {[25, 80, 135, 190, 245].map((y) => (
              <g key={y}>
                <line x1="45" y1={y} x2="735" y2={y} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <rect x="5" y={y - 4} width="25" height="8" rx="3" fill="currentColor" fillOpacity="0.15" />
                <rect x="752" y={y - 4} width="35" height="8" rx="3" fill="currentColor" fillOpacity="0.15" />
              </g>
            ))}
            {[65, 105, 80, 145, 115, 165, 130, 180, 150, 195, 165, 205].map((height, index) => (
              <rect key={index} x={60 + index * 56} y={245 - height} width="26" height={height} rx="4" fill="currentColor" fillOpacity="0.16" />
            ))}
            <path d="M73 185 C95 185 107 145 129 145 S163 170 185 170 S219 105 241 105 S275 130 297 130 S331 80 353 80 S387 110 409 110 S443 65 465 65 S499 95 521 95 S555 50 577 50 S611 75 633 75 S667 35 689 35" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            {[65, 185, 305, 425, 545, 665].map((x) => (
              <rect key={x} x={x} y="262" width="35" height="8" rx="3" fill="currentColor" fillOpacity="0.15" />
            ))}
          </svg>
          <div className="flex h-10 items-center justify-center gap-5">
            {[0, 1].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <div className="size-3 rounded-sm bg-chart-2/25" />
                <div className="h-3 w-20 rounded bg-chart-2/15 sm:w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function bucketLabel(bucket: string, period: OverviewPeriod) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    ...(period === 'today'
      ? { hour: '2-digit' as const, minute: '2-digit' as const, hourCycle: 'h23' as const }
      : { day: 'numeric' as const, month: 'short' as const }),
  }).format(new Date(bucket))
}

export function WriterOverview({ contentId }: { contentId: string }) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const { accessToken, user } = useAuth()
  const [period, setPeriod] = useState<OverviewPeriod>('today')
  const userId = user?.id
  const scope = JSON.stringify([userId, contentId])
  const cacheKey = JSON.stringify([userId, contentId, period])
  const cachedData = userId && accessToken ? overviewCache.get(cacheKey) : undefined
  const [loaded, setLoaded] = useState<{ scope: string; data: OverviewData } | null>(null)
  const data = cachedData ?? (accessToken && loaded?.scope === scope ? loaded.data : null)
  const [requestLoading, setLoading] = useState(true)
  const loading = !cachedData && requestLoading
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setError(null)
    if (!accessToken || !userId) return
    const cached = overviewCache.get(cacheKey)
    if (cached) {
      setLoaded({ scope, data: cached })
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    loadOverview(cacheKey, contentId, period, accessToken)
      .then((result) => {
        if (!cancelled) setLoaded({ scope, data: result })
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'ไม่สามารถโหลดภาพรวมได้')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [accessToken, userId, contentId, period, reloadKey, cacheKey, scope])

  const chartData = data?.purchases.map((point) => ({
    label: bucketLabel(point.bucket, data.period),
    purchase_count: Number(point.purchase_count),
    gross_sales: Number(point.gross_sales),
  })) ?? []
  const purchaseCount = chartData.reduce((total, point) => total + point.purchase_count, 0)
  const grossSales = chartData.reduce((total, point) => total + point.gross_sales, 0)
  const stats = [
    { label: 'ยอดเข้าชม', value: data?.summary.total_views, icon: EyeIcon, unit: 'ครั้ง' },
    { label: 'จำนวนตอน', value: data?.summary.chapter_count, icon: BookOpenIcon, unit: 'ตอน' },
  ]

  return (
    <section className="mt-4 space-y-4" aria-busy={loading && !data}>

      {error && !data && (
        <div role="alert" className="readji-surface space-y-2 rounded-xl bg-card p-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>ลองใหม่</Button>
        </div>
      )}

      {(loading || data) && (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="icon" className="size-8 shrink-0 rounded-lg">
                <Link href="/writer/contents" aria-label="ย้อนกลับ" title="ย้อนกลับ">
                  <ArrowLeftIcon />
                </Link>
              </Button>
              <h2 className="text-base font-bold">สถิติภาพรวม <span className="text-sm font-normal text-muted-foreground">ทั้งหมด</span></h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map(({ label, value, icon: Icon, unit }) => (
                <div key={label} className="readji-surface rounded-xl bg-card p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4 text-primary" />{label}</div>
                  {data ? (
                    <p className="mt-2 text-2xl font-bold tabular-nums">{countFormat.format(Number(value))} <span className="text-sm font-normal text-muted-foreground">{unit}</span></p>
                  ) : (
                    <div role="status" className="mt-2 h-8">
                      <span className="sr-only">กำลังโหลด{label}</span>
                      <Skeleton className="h-8 w-28 max-w-full" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="readji-surface min-w-0 rounded-xl bg-card p-3 sm:p-4" aria-busy={loading}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">การซื้อจากเรื่องนี้</h2>
            <p className="mt-1 text-xs text-muted-foreground">ยอดซื้อรวมก่อนหักส่วนแบ่ง · เวลาไทย</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label="ช่วงเวลาการซื้อ">
            {periods.map((item) => (
              <Button key={item.value} size="sm" variant={period === item.value ? 'default' : 'ghost'} aria-pressed={period === item.value} onClick={() => { setPeriod(item.value); setError(null); setLoading(true) }} disabled={period === item.value} className="rounded-lg disabled:opacity-100">
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {period === 'today' ? 'วันนี้ แสดงรายชั่วโมง' : period === 'this-week' ? 'สัปดาห์นี้ เริ่มวันจันทร์ แสดงรายวัน' : 'เดือนนี้ เริ่มวันที่ 1 แสดงรายวัน'} · ข้อมูลถึงเวลาที่โหลดล่าสุด
        </p>
        {loading ? <PurchaseChartSkeleton /> : error && data ? (
          <div role="alert" className="space-y-2 py-8 text-center">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>ลองใหม่</Button>
          </div>
        ) : data ? (
          <>
            <div className="my-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">จำนวนครั้งที่ซื้อตอนในช่วงนี้</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{countFormat.format(purchaseCount)} <span className="text-sm font-normal">ครั้ง</span></p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">ยอดซื้อรวมในช่วงนี้</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xl font-bold tabular-nums"><GiTwoCoins className="size-5 shrink-0 text-primary" />{salesFormat.format(grossSales)} <span className="text-sm font-normal">{SITE_CONFIG.coinName}</span></p>
              </div>
            </div>
            {purchaseCount === 0 && <p role="status" className="mb-2 text-center text-sm text-muted-foreground">ยังไม่มีการซื้อในช่วงเวลานี้</p>}
            <div className="h-60 min-w-0 w-full sm:h-64" role="group" aria-label="กราฟจำนวนครั้งที่ซื้อตอนและยอดซื้อรวมก่อนหักส่วนแบ่ง">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 0, bottom: 10, left: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} minTickGap={24} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="count" width={45} allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="sales" orientation="right" width={65} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(value) => countFormat.format(Number(value))} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} formatter={(value, name) => [name === 'จำนวนครั้งที่ซื้อ' ? `${countFormat.format(Number(value))} ครั้ง` : `${salesFormat.format(Number(value))} ${SITE_CONFIG.coinName}`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="count" dataKey="purchase_count" name="จำนวนครั้งที่ซื้อ" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Line yAxisId="sales" type="monotone" dataKey="gross_sales" name={`ยอดซื้อรวม (${SITE_CONFIG.coinName})`} stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : <p className="py-8 text-center text-sm text-muted-foreground">ไม่สามารถแสดงกราฟได้</p>}
      </div>
    </section>
  )
}
