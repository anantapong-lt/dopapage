'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Activity, CalendarIcon, ChevronLeft, ChevronRight, Cpu, HardDrive, MemoryStick, RefreshCw, ScrollText, Search } from 'lucide-react'
import { th } from 'react-day-picker/locale'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const REFRESH_INTERVAL_MS = 5_000
const LOG_LIMIT = 50
const today = new Date().toISOString().slice(0, 10)

type Metric = { total_bytes: number; used_bytes: number; available_bytes: number }
type SystemMetrics = {
  updated_at: string
  cpu: { usage_percent: number; cores: number }
  memory: Metric
  storage: Metric
  assets: { total_bytes: number; folders: Array<{ name: string; bytes: number }> }
}
type LogStatus = 'all' | '2xx' | '3xx' | '4xx' | '5xx'
type SystemLog = {
  timestamp: string
  level: 'success' | 'redirect' | 'client_error' | 'server_error'
  status_code: number
  message: string
}
type LogsResponse = {
  date: string
  logs: SystemLog[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

function formatBytes(value: number) {
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(0)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function percentage(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  percent,
  children,
}: {
  icon: typeof Cpu
  label: string
  value: string
  detail: string
  percent: number
  children?: ReactNode
}) {
  const color = percent >= 90 ? 'bg-destructive' : percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-5 text-primary" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-bold tabular-nums">{value}</p>
          <Badge variant="secondary" className="tabular-nums">{percent}%</Badge>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {children}
      </CardContent>
    </Card>
  )
}

function logColor(level: SystemLog['level']) {
  if (level === 'server_error') return 'text-red-400'
  if (level === 'client_error') return 'text-amber-300'
  if (level === 'redirect') return 'text-sky-300'
  return 'text-emerald-300'
}

function LogDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = new Date(`${value}T12:00:00`)
  return (
    <Popover>
      <PopoverTrigger render={
        <Button type="button" variant="outline" className="justify-start font-normal">
          <CalendarIcon />{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(selected)}
        </Button>
      } />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          locale={th}
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={{ after: new Date() }}
          onSelect={(date) => {
            if (!date) return
            onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export default function SystemPage() {
  const { accessToken } = useAdminAuth()
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [logsData, setLogsData] = useState<LogsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [logStatus, setLogStatus] = useState<LogStatus>('all')
  const [logDate, setLogDate] = useState(today)
  const [logPage, setLogPage] = useState(1)

  const loadSystemState = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken) return
    setIsRefreshing(true)
    const query = new URLSearchParams({
      page: String(logPage),
      limit: String(LOG_LIMIT),
      status: logStatus,
      date: logDate,
    })
    if (submittedSearch) query.set('search', submittedSearch)

    try {
      const [metricsResponse, logsResponse] = await Promise.all([
        fetch(`${apiUrl}/admin/system/metrics`, {
          headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include', cache: 'no-store', signal,
        }),
        fetch(`${apiUrl}/admin/system/logs?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include', cache: 'no-store', signal,
        }),
      ])
      const metricsBody = await metricsResponse.json() as SystemMetrics | { message?: string }
      const logsBody = await logsResponse.json() as LogsResponse | { message?: string }
      if (!metricsResponse.ok) throw new Error('message' in metricsBody ? metricsBody.message : 'ไม่สามารถโหลดสถานะระบบได้')
      if (!logsResponse.ok) throw new Error('message' in logsBody ? logsBody.message : 'ไม่สามารถโหลด API logs ได้')
      const nextLogs = logsBody as LogsResponse
      setMetrics(metricsBody as SystemMetrics)
      setLogsData(nextLogs)
      setError(null)
      if (nextLogs.pagination.page !== logPage) setLogPage(nextLogs.pagination.page)
    } catch (requestError) {
      if (!signal?.aborted) setError(requestError instanceof Error ? requestError.message : 'ไม่สามารถโหลดสถานะระบบได้')
    } finally {
      if (!signal?.aborted) setIsRefreshing(false)
    }
  }, [accessToken, logDate, logPage, logStatus, submittedSearch])

  useEffect(() => {
    const controller = new AbortController()
    void loadSystemState(controller.signal)
    const interval = window.setInterval(() => void loadSystemState(), REFRESH_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [loadSystemState])

  const memoryPercent = metrics ? percentage(metrics.memory.used_bytes, metrics.memory.total_bytes) : 0
  const storagePercent = metrics ? percentage(metrics.storage.used_bytes, metrics.storage.total_bytes) : 0
  const pagination = logsData?.pagination

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">สถานะระบบ</h1></div>
        <Button type="button" variant="outline" onClick={() => void loadSystemState()} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'animate-spin' : ''} /> รีเฟรช
        </Button>
      </div>

      {error ? (
        <Card><CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent></Card>
      ) : !metrics ? (
        <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-48" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard icon={Cpu} label="CPU" value={`${metrics.cpu.usage_percent.toFixed(1)}%`} detail={`${metrics.cpu.cores} vCPU`} percent={Math.round(metrics.cpu.usage_percent)} />
            <MetricCard icon={MemoryStick} label="RAM" value={formatBytes(metrics.memory.used_bytes)} detail={`จาก ${formatBytes(metrics.memory.total_bytes)} · ว่าง ${formatBytes(metrics.memory.available_bytes)}`} percent={memoryPercent} />
            <MetricCard icon={HardDrive} label="Storage" value={formatBytes(metrics.storage.used_bytes)} detail={`จาก ${formatBytes(metrics.storage.total_bytes)} · ว่าง ${formatBytes(metrics.storage.available_bytes)}`} percent={storagePercent}>
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Assets</span><span className="tabular-nums">{formatBytes(metrics.assets.total_bytes)}</span></div>
                {metrics.assets.folders.length ? metrics.assets.folders.map((folder) => {
                  const folderPercent = percentage(folder.bytes, metrics.assets.total_bytes)
                  return <div key={folder.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{folder.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(folder.bytes)} · {folderPercent}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${folderPercent}%` }} /></div>
                  </div>
                }) : <p className="text-xs text-muted-foreground">ยังไม่มีไฟล์ใน assets</p>}
              </div>
            </MetricCard>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="size-3.5 text-emerald-500" /> อัปเดตล่าสุด {new Date(metrics.updated_at).toLocaleTimeString('th-TH')}</p>

          <Card>
            <CardHeader className="gap-4 border-b">
              <div className="flex items-center gap-2"><ScrollText className="size-5 text-primary" /><CardTitle>API Logs</CardTitle></div>
              <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]" onSubmit={(event) => {
                event.preventDefault()
                setLogPage(1)
                setSubmittedSearch(search.trim())
              }}>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหา method หรือ path" />
                <Select value={logStatus} onValueChange={(value) => { setLogStatus(value as LogStatus); setLogPage(1) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกสถานะ</SelectItem>
                    <SelectItem value="2xx">2xx สำเร็จ</SelectItem>
                    <SelectItem value="3xx">3xx เปลี่ยนเส้นทาง</SelectItem>
                    <SelectItem value="4xx">4xx ข้อผิดพลาดผู้ใช้</SelectItem>
                    <SelectItem value="5xx">5xx ข้อผิดพลาดเซิร์ฟเวอร์</SelectItem>
                  </SelectContent>
                </Select>
                <LogDatePicker value={logDate} onChange={(value) => { setLogDate(value); setLogPage(1) }} />
                <Button type="submit" variant="outline" aria-label="ค้นหา Log"><Search />ค้นหา</Button>
              </form>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-auto bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-100">
                {!logsData ? <p className="text-slate-400">กำลังโหลด API logs...</p> : logsData.logs.length ? logsData.logs.map((log, index) => (
                  <p key={`${log.timestamp}-${index}`} className={logColor(log.level)}><span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString('th-TH')}]</span> {log.message}</p>
                )) : <p className="text-slate-400">ไม่พบ API logs ตามเงื่อนไขที่เลือก</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                <span className="text-sm text-muted-foreground">{pagination ? `พบ ${pagination.total.toLocaleString('th-TH')} รายการ · หน้า ${pagination.page} จาก ${pagination.totalPages}` : 'กำลังโหลดรายการ'}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={isRefreshing || !pagination || pagination.page <= 1} onClick={() => setLogPage((current) => Math.max(1, current - 1))}><ChevronLeft />ก่อนหน้า</Button>
                  <Button size="sm" variant="outline" disabled={isRefreshing || !pagination || pagination.page >= pagination.totalPages} onClick={() => setLogPage((current) => current + 1)}>ถัดไป<ChevronRight /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  )
}
