'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'
import { formatCoin } from '@/utils/format-coin'

type LedgerType =
  | 'topup'
  | 'purchase'
  | 'sale'
  | 'withdrawal_request'
  | 'withdrawal_refund'
  | 'admin_adjustment'

interface LedgerEntry {
  id: string
  entry_type: LedgerType
  amount: string
  balance_before: string
  balance_after: string
  reference_type: string | null
  reference_id: string | null
  note: string | null
  created_at: string
  user_display_name: string
  user_username: string
  user_email: string
  actor_display_name: string | null
  actor_username: string | null
}

interface LedgerResponse {
  entries: LedgerEntry[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })

const typeLabels: Record<LedgerType, string> = {
  topup: 'เติมเงิน',
  purchase: 'ซื้อตอน',
  sale: 'รายได้จากการขาย',
  withdrawal_request: 'ขอถอนเงิน',
  withdrawal_refund: 'คืนยอดจากคำขอถอน',
  admin_adjustment: 'แอดมินปรับยอด',
}

function formatSignedCoin(value: string) {
  const formatted = formatCoin(value)
  return Number(value) > 0 ? `+${formatted}` : formatted
}

export default function CoinLedgerPage() {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const { accessToken } = useAdminAuth()
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [type, setType] = useState<'all' | LedgerType>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<LedgerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    if (!accessToken) return

    setLoading(true)
    setError(null)
    const query = new URLSearchParams({ page: String(page), limit: '20', type })
    if (submittedSearch) query.set('search', submittedSearch)

    try {
      const response = await fetch(`${apiUrl}/admin/coin-ledger?${query}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        cache: 'no-store',
      })
      const body = (await response.json().catch(() => null)) as LedgerResponse | { message?: string } | null
      if (!response.ok) throw new Error(body && 'message' in body && body.message ? body.message : 'ไม่สามารถโหลดประวัติยอดคงเหลือได้')
      setData(body as LedgerResponse)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ไม่สามารถโหลดประวัติยอดคงเหลือได้')
    } finally {
      setLoading(false)
    }
  }, [accessToken, page, submittedSearch, type])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  return (
    <main className="mx-auto w-full p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <GiTwoCoins className="size-6 text-primary" />
          ประวัติ{SITE_CONFIG.coinName}
        </h1>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b">
          <CardTitle>
            {data ? `พบ ${data.pagination.total.toLocaleString('th-TH')} รายการ` : 'กำลังโหลดประวัติ'}
          </CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setPage(1)
                setSubmittedSearch(search.trim())
              }}
              className="flex flex-1 gap-2 sm:min-w-80"
            >
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาชื่อ, Username หรืออีเมล"
                aria-label="ค้นหาผู้ใช้งาน"
              />
              <Button type="submit" variant="outline" size="icon" aria-label="ค้นหา">
                <Search />
              </Button>
            </form>
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value === null || value === 'all' ? 'all' : (value as LedgerType))
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue>{() => (type === 'all' ? 'ทุกประเภท' : typeLabels[type])}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectItem value="all">ทุกประเภท</SelectItem>
                {(Object.keys(typeLabels) as LedgerType[]).map((key) => (
                  <SelectItem key={key} value={key}>{typeLabels[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เวลา</TableHead>
                  <TableHead>ผู้ใช้งาน</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                  <TableHead className="text-right">ยอดก่อน</TableHead>
                  <TableHead className="text-right">ยอดหลัง</TableHead>
                  <TableHead>ทำโดย</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 8 }).map((__, cellIndex) => (
                        <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data?.entries.length ? (
                  data.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">{dateTime.format(new Date(entry.created_at))}</TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.user_display_name}</div>
                        <div className="text-xs text-muted-foreground">@{entry.user_username} · {entry.user_email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.entry_type === 'admin_adjustment' ? 'destructive' : 'secondary'}>
                          {typeLabels[entry.entry_type]}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${Number(entry.amount) < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                      >
                        {formatSignedCoin(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(entry.balance_before)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(entry.balance_after)}</TableCell>
                      <TableCell>
                        {entry.actor_display_name ? (
                          <>
                            <div>{entry.actor_display_name}</div>
                            <div className="text-xs text-muted-foreground">@{entry.actor_username}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">ระบบ</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{entry.note ?? '-'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      ยังไม่มีประวัติ{SITE_CONFIG.coinName}ที่ตรงกับเงื่อนไข
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-sm text-muted-foreground">
            หน้า {data?.pagination.page ?? 1} จาก {data?.pagination.totalPages ?? 1}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft />
              ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !data || page >= data.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              ถัดไป
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>
    </main>
  )
}
