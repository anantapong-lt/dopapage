'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from 'lucide-react'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const REFRESH_INTERVAL_MS = 5_000

type Metric = { total_bytes: number; used_bytes: number; available_bytes: number }
type SystemMetrics = {
  updated_at: string
  cpu: { usage_percent: number; cores: number }
  memory: Metric
  storage: Metric
}

function formatBytes(value: number) {
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(0)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function percentage(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
}

function MetricCard({ icon: Icon, label, value, detail, percent }: {
  icon: typeof Cpu
  label: string
  value: string
  detail: string
  percent: number
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
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${percent}%` }} /></div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

export default function SystemPage() {
  const { accessToken } = useAdminAuth()
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadMetrics = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken) return
    setIsRefreshing(true)
    try {
      const response = await fetch(`${apiUrl}/admin/system/metrics`, {
        headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include', cache: 'no-store', signal,
      })
      const body = await response.json() as SystemMetrics | { message?: string }
      if (!response.ok) throw new Error('message' in body ? body.message : 'ไม่สามารถโหลดสถานะระบบได้')
      setMetrics(body as SystemMetrics)
      setError(null)
    } catch (requestError) {
      if (!signal?.aborted) setError(requestError instanceof Error ? requestError.message : 'ไม่สามารถโหลดสถานะระบบได้')
    } finally {
      if (!signal?.aborted) setIsRefreshing(false)
    }
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    void loadMetrics(controller.signal)
    const interval = window.setInterval(() => void loadMetrics(), REFRESH_INTERVAL_MS)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [loadMetrics])

  const memoryPercent = metrics ? percentage(metrics.memory.used_bytes, metrics.memory.total_bytes) : 0
  const storagePercent = metrics ? percentage(metrics.storage.used_bytes, metrics.storage.total_bytes) : 0

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">สถานะระบบ</h1>
          <p className="mt-1 text-sm text-muted-foreground">ติดตามทรัพยากร VPS แบบ realtime ทุก 5 วินาที</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadMetrics()} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'animate-spin' : ''} /> รีเฟรช
        </Button>
      </div>

      {error ? <Card><CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent></Card> : !metrics ? (
        <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-48" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard icon={Cpu} label="CPU" value={`${metrics.cpu.usage_percent.toFixed(1)}%`} detail={`${metrics.cpu.cores} vCPU`} percent={Math.round(metrics.cpu.usage_percent)} />
            <MetricCard icon={MemoryStick} label="RAM" value={formatBytes(metrics.memory.used_bytes)} detail={`จาก ${formatBytes(metrics.memory.total_bytes)} · ว่าง ${formatBytes(metrics.memory.available_bytes)}`} percent={memoryPercent} />
            <MetricCard icon={HardDrive} label="Storage" value={formatBytes(metrics.storage.used_bytes)} detail={`จาก ${formatBytes(metrics.storage.total_bytes)} · ว่าง ${formatBytes(metrics.storage.available_bytes)}`} percent={storagePercent} />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="size-3.5 text-emerald-500" /> อัปเดตล่าสุด {new Date(metrics.updated_at).toLocaleTimeString('th-TH')}</p>
        </>
      )}
    </main>
  )
}
