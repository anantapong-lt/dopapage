'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ban, ChevronLeft, ChevronRight, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatCoin } from '@/utils/format-coin'

const USER_STATUS = {
  ACTIVE: 'active',
  HIDDEN: 'hidden',
  SUSPENDED: 'suspended',
} as const

type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS]

interface Writer {
  id: string
  display_name: string
  username: string
  email: string
  phone_number: string | null
  avatar_url: string | null
  status: UserStatus
  balance: string
  created_at: string
  last_login_at: string | null
  content_count: string
  novel_count: string
  manga_count: string
  chapter_count: string
  total_views: string
  sales_count: string
  sales_total: string
  net_revenue: string
}

interface WritersResponse {
  writers: Writer[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const statusLabel: Record<UserStatus, string> = {
  [USER_STATUS.ACTIVE]: 'ใช้งาน',
  [USER_STATUS.HIDDEN]: 'ซ่อน',
  [USER_STATUS.SUSPENDED]: 'ระงับ',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value))
}

function formatNumber(value: string) {
  return Number(value).toLocaleString('th-TH')
}

export default function WritersPage() {
  const { accessToken } = useAdminAuth()
  const [data, setData] = useState<WritersResponse | null>(null)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [status, setStatus] = useState<'all' | UserStatus>('all')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusChange, setStatusChange] = useState<{ writer: Writer; nextStatus: UserStatus } | null>(null)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [banReasonError, setBanReasonError] = useState<string | null>(null)

  const loadWriters = useCallback(async () => {
    if (!accessToken) return
    setIsLoading(true)
    setError(null)
    const query = new URLSearchParams({ page: String(page), limit: '20' })
    if (submittedSearch) query.set('search', submittedSearch)
    if (status !== 'all') query.set('status', status)
    try {
      const response = await fetch(`${apiUrl}/admin/writers?${query}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      })
      const body = await response.json().catch(() => null) as WritersResponse | { message?: string } | null
      if (!response.ok) throw new Error(body && 'message' in body ? body.message : 'ไม่สามารถโหลดรายชื่อนักเขียนได้')
      setData(body as WritersResponse)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'ไม่สามารถโหลดรายชื่อนักเขียนได้')
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, page, status, submittedSearch])

  useEffect(() => { void loadWriters() }, [loadWriters])

  async function submitStatusChange() {
    if (!statusChange || !accessToken || isChangingStatus) return
    const normalizedBanReason = banReason.trim()
    if (statusChange.nextStatus !== USER_STATUS.ACTIVE && !normalizedBanReason) {
      setBanReasonError('กรุณาระบุเหตุผลในการแบนผู้เขียน')
      return
    }

    setIsChangingStatus(true)
    setBanReasonError(null)
    try {
      const response = await fetch(`${apiUrl}/admin/writers/${statusChange.writer.id}/status`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          status: statusChange.nextStatus,
          ...(statusChange.nextStatus !== USER_STATUS.ACTIVE ? { reason: normalizedBanReason } : {}),
        }),
      })
      const body = await response.json().catch(() => null) as { message?: string } | null
      if (!response.ok) throw new Error(body?.message ?? 'ไม่สามารถเปลี่ยนสถานะนักเขียนได้')
      toast.success('เปลี่ยนสถานะนักเขียนเรียบร้อยแล้ว')
      setStatusChange(null)
      setBanReason('')
      await loadWriters()
    } catch (changeError) {
      toast.error(changeError instanceof Error ? changeError.message : 'ไม่สามารถเปลี่ยนสถานะนักเขียนได้')
    } finally {
      setIsChangingStatus(false)
    }
  }

  return <main className="mx-auto w-full p-4 md:p-6">
    <div className="mb-6 flex flex-col gap-1"><h1 className="flex items-center gap-2 text-2xl font-semibold"><UsersRound className="size-6 text-primary" />นักเขียนทั้งหมด</h1></div>
    <Card>
      <CardHeader className="gap-4 border-b"><div><CardTitle>{data ? `พบ ${data.pagination.total.toLocaleString('th-TH')} นักเขียน` : 'กำลังโหลดรายชื่อนักเขียน'}</CardTitle></div><div className="flex flex-col gap-2 sm:flex-row"><form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedSearch(search.trim()) }}><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ Username หรืออีเมล" /><Button type="submit" variant="outline" size="icon" aria-label="ค้นหา"><Search /></Button></form><Select value={status} onValueChange={(value) => { setStatus(value as 'all' | UserStatus); setPage(1) }}><SelectTrigger className="w-full sm:w-40"><SelectValue>{() => status === 'all' ? 'ทุกสถานะ' : statusLabel[status]}</SelectValue></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false}><SelectItem value="all">ทุกสถานะ</SelectItem><SelectItem value="active">ใช้งาน</SelectItem><SelectItem value="hidden">ซ่อน</SelectItem><SelectItem value="suspended">ระงับ</SelectItem></SelectContent></Select></div></CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>นักเขียน</TableHead>
                <TableHead className="text-right">ผลงาน</TableHead>
                <TableHead className="text-right">นิยาย</TableHead>
                <TableHead className="text-right">มังงะ</TableHead>
                <TableHead className="text-right">ยอดขาย</TableHead>
                <TableHead className="text-right">รายได้สุทธิ</TableHead>
                <TableHead className="text-right">ยอดเงินคงเหลือ</TableHead>
                <TableHead>วันที่สมัคร</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 10 }, (_, cellIndex) => (
                      <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.writers.length ? (
                data.writers.map((writer) => {
                  const nextStatus = writer.status === USER_STATUS.ACTIVE ? USER_STATUS.SUSPENDED : USER_STATUS.ACTIVE
                  return (
                    <TableRow key={writer.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {writer.avatar_url ? <img src={writer.avatar_url} alt="" className="size-9 rounded-full object-cover" /> : <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><UsersRound className="size-4" /></span>}
                          <div>
                            <div className="font-medium">{writer.display_name}</div>
                            <div className="text-xs text-muted-foreground">@{writer.username} · {writer.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(writer.content_count)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(writer.novel_count)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(writer.manga_count)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(writer.sales_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(writer.net_revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(writer.balance)}</TableCell>
                      <TableCell>{formatDate(writer.created_at)}</TableCell>
                      <TableCell className="align-middle">
                        <Badge
                          variant="outline"
                          className={writer.status === USER_STATUS.ACTIVE
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : writer.status === USER_STATUS.SUSPENDED
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'}
                        >
                          {statusLabel[writer.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-middle text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={nextStatus === USER_STATUS.SUSPENDED ? 'destructive' : 'outline'}
                          onClick={() => {
                            setStatusChange({ writer, nextStatus })
                            setBanReason('')
                            setBanReasonError(null)
                          }}
                        >
                          {nextStatus === USER_STATUS.SUSPENDED ? <Ban /> : <ShieldCheck />}
                          {nextStatus === USER_STATUS.SUSPENDED ? 'ระงับ' : 'ใช้งาน'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow><TableCell colSpan={10} className="h-32 text-center text-muted-foreground">ไม่พบนักเขียนที่ตรงกับเงื่อนไข</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <div className="flex items-center justify-between border-t px-4 py-3"><span className="text-sm text-muted-foreground">หน้า {data?.pagination.page ?? 1} จาก {data?.pagination.totalPages ?? 1}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={isLoading || page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft />ก่อนหน้า</Button><Button size="sm" variant="outline" disabled={isLoading || !data || page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>ถัดไป<ChevronRight /></Button></div></div>
    </Card>
    <Dialog open={Boolean(statusChange)} onOpenChange={(open) => {
      if (!open && !isChangingStatus) {
        setStatusChange(null)
        setBanReason('')
        setBanReasonError(null)
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {statusChange ? `ยืนยันการ${statusLabel[statusChange.nextStatus]}นักเขียน` : 'ยืนยันการเปลี่ยนสถานะนักเขียน'}
          </DialogTitle>
          <DialogDescription>
            {statusChange?.nextStatus === USER_STATUS.SUSPENDED
              ? `บัญชี ${statusChange?.writer.display_name ?? ''} จะถูกระงับโดยแอดมิน ผู้ใช้ไม่สามารถเปิดใช้งานหรือปลดระงับบัญชีเองได้`
              : statusChange?.nextStatus === USER_STATUS.HIDDEN
                ? `ผู้ใช้ ${statusChange?.writer.display_name ?? ''} และผลงานจะไม่แสดงบนเว็บไซต์ แต่ยังจัดการบัญชีและผลงานของตนได้`
                : `บัญชี ${statusChange?.writer.display_name ?? ''} จะกลับมาใช้งานและแสดงบนเว็บไซต์ได้ โดยมีเพียงแอดมินที่เปลี่ยนสถานะนี้ได้`}
          </DialogDescription>
          {statusChange?.nextStatus !== USER_STATUS.ACTIVE ? (
            <div className="space-y-2">
              <label htmlFor="writer-status-reason" className="text-sm font-medium">เหตุผลในการเปลี่ยนสถานะ <span className="text-destructive">*</span></label>
              <Textarea
                id="writer-status-reason"
                value={banReason}
                onChange={(event) => {
                  setBanReason(event.target.value)
                  if (banReasonError) setBanReasonError(null)
                }}
                placeholder="ระบุเหตุผลในการซ่อนหรือระงับนักเขียน"
                maxLength={1000}
                disabled={isChangingStatus}
                aria-invalid={Boolean(banReasonError)}
              />
              {banReasonError ? <p className="text-sm text-destructive">{banReasonError}</p> : null}
            </div>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isChangingStatus} onClick={() => setStatusChange(null)}>ยกเลิก</Button>
          <Button
            type="button"
            variant={statusChange?.nextStatus === USER_STATUS.SUSPENDED ? 'destructive' : 'default'}
            disabled={isChangingStatus}
            onClick={() => void submitStatusChange()}
          >
            {isChangingStatus ? 'กำลังบันทึก...' : 'ยืนยันการเปลี่ยนสถานะ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
}
