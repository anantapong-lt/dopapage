'use client'

import { Eye } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { WriterDashboardData, WriterDashboardPeriod } from '@/interface/writer-stats.interface'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'

const periods: { value: WriterDashboardPeriod; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: 'this-week', label: 'อาทิตย์นี้' },
  { value: 'this-month', label: 'เดือนนี้' },
]
const countFormat = new Intl.NumberFormat('th-TH')
const salesFormat = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function bucketLabel(bucket: string, period: WriterDashboardPeriod) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    ...(period === 'today'
      ? { hour: '2-digit' as const, minute: '2-digit' as const, hourCycle: 'h23' as const }
      : { day: 'numeric' as const, month: 'short' as const }),
  }).format(new Date(bucket))
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <article className="readji-surface min-w-0 rounded-2xl bg-card p-4 sm:p-5" aria-label={`กำลังโหลด${title}`}>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <div className="mt-5 flex h-56 items-end gap-2">
        {[35, 58, 44, 76, 52, 88, 66, 94].map((height, index) => <Skeleton key={index} className="flex-1 rounded-b-none" style={{ height: `${height}%` }} />)}
      </div>
      <div className="mt-3 flex justify-between gap-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-12" /></div>
    </article>
  )
}

function TopListSkeleton() {
  return (
    <article className="readji-surface rounded-2xl bg-card p-4 sm:p-5">
      <Skeleton className="h-5 w-28" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-10 w-full" />)}
      </div>
    </article>
  )
}

interface Props {
  data: WriterDashboardData | null
  period: WriterDashboardPeriod
  onPeriodChange: (period: WriterDashboardPeriod) => void
  hasError: boolean
}

function ChartTooltip({ value, unit, label }: { value: number; unit: string; label: string }) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  return <>{`${label}: ${unit === SITE_CONFIG.coinName ? salesFormat.format(value) : countFormat.format(value)} ${unit}`}</>
}

function TopStoryList({
  title,
  stories,
  metric,
}: {
  title: string
  stories: WriterDashboardData['top_stories']['sales']
  metric: 'sales' | 'views'
}) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  return (
    <article className="readji-surface min-w-0 rounded-2xl bg-card p-4 sm:p-5">
      <h3 className="font-bold">{title}</h3>
      <ol className="mt-3 space-y-1">
        {stories.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลในช่วงเวลานี้</li> : stories.map((story, index) => (
          <li key={story.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 even:bg-muted/40">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{index + 1}</span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{story.title}</p>
            <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums">
              {metric === 'sales' && <GiTwoCoins className="size-4 text-primary" />}
              {metric === 'sales' ? salesFormat.format(Number(story.value)) : countFormat.format(Number(story.value))}
              <span className="text-xs font-normal text-muted-foreground">{metric === 'sales' ? SITE_CONFIG.coinName : 'ครั้ง'}</span>
            </span>
          </li>
        ))}
      </ol>
    </article>
  )
}

export function WriterDashboardCharts({ data, period, onPeriodChange, hasError }: Props) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const chartData = data?.activity.map((point) => ({
    label: bucketLabel(point.bucket, period),
    gross_sales: Number(point.gross_sales),
    view_count: Number(point.view_count),
  })) ?? []
  const grossSales = chartData.reduce((total, point) => total + point.gross_sales, 0)
  const totalViews = chartData.reduce((total, point) => total + point.view_count, 0)

  return (
    <section className="mt-6" aria-busy={!data && !hasError}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-[-0.025em]">สถิติช่วงเวลา</h2>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="เลือกช่วงเวลาสถิติ">
          {periods.map((item) => <Button key={item.value} size="sm" variant={period === item.value ? 'default' : 'ghost'} aria-pressed={period === item.value} disabled={period === item.value} onClick={() => onPeriodChange(item.value)} className="rounded-md disabled:opacity-100">{item.label}</Button>)}
        </div>
      </div>

      {hasError && !data ? null : !data ? (
        <div className="space-y-4"><ChartSkeleton title="กราฟยอดขาย" /><div className="grid gap-4 lg:grid-cols-2"><TopListSkeleton /><TopListSkeleton /></div></div>
      ) : (
        <div className="space-y-4">
          <article className="readji-surface min-w-0 rounded-2xl bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">ยอดขาย</h3><p className="mt-1 flex items-center gap-1 text-2xl font-bold tabular-nums"><GiTwoCoins className="size-5 text-primary" />{salesFormat.format(grossSales)}</p></div><span className="pt-1 text-xs text-muted-foreground">{SITE_CONFIG.coinName}</span></div>
            <div className="mt-4 h-56 w-full" role="img" aria-label="กราฟยอดขาย">
              <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} /><YAxis width={52} tickFormatter={(value) => countFormat.format(Number(value))} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 12, backgroundColor: 'var(--card)', borderColor: 'var(--border)' }} formatter={(value) => [<ChartTooltip value={Number(value)} unit={SITE_CONFIG.coinName} label="ยอดขาย" />, '']} /><Line type="monotone" dataKey="gross_sales" stroke="var(--chart-3)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer>
            </div>
          </article>
          <article className="hidden readji-surface min-w-0 rounded-2xl bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">ยอดอ่าน</h3><p className="mt-1 flex items-center gap-1 text-2xl font-bold tabular-nums"><Eye className="size-5 text-primary" />{countFormat.format(totalViews)}</p></div><span className="pt-1 text-xs text-muted-foreground">ครั้ง</span></div>
            <div className="mt-4 h-56 w-full" role="img" aria-label="กราฟยอดอ่าน">
              <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} /><YAxis width={45} allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 12, backgroundColor: 'var(--card)', borderColor: 'var(--border)' }} formatter={(value) => [<ChartTooltip value={Number(value)} unit="ครั้ง" label="ยอดอ่าน" />, '']} /><Line type="monotone" dataKey="view_count" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer>
            </div>
          </article>
          <div className="grid gap-4 lg:grid-cols-2">
            <TopStoryList title="Top 5 ยอดขาย" stories={data.top_stories.sales} metric="sales" />
            <TopStoryList title="Top 5 ยอดอ่าน" stories={data.top_stories.views} metric="views" />
          </div>
        </div>
      )}
    </section>
  )
}
