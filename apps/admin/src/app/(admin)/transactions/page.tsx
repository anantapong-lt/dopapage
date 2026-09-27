'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  MoreHorizontal,
  Search,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { WITHDRAWAL_STATUS, type WithdrawalStatus } from '@/constants/withdrawal.constant'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type PaymentMethod = 'bank' | 'promptpay'
type DateRange = 'all' | 'today' | '7d' | '30d'
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

interface WithdrawalRequest {
  id: string
  user: { displayName: string; username: string }
  requestedAmount: number
  fee: number
  netAmount: number
  paymentMethod: PaymentMethod
  bankCode: string
  accountNumber: string
  submittedAt: string
  status: WithdrawalStatus
  processedBy: string | null
  note: string | null
  transferProofName: string | null
  transferProofUrl: string | null
}

interface BankConfig {
  code: string
  name: string
  logo: string
}

const statusLabels: Record<WithdrawalStatus, string> = {
  [WITHDRAWAL_STATUS.PENDING]: 'รอตรวจสอบ',
  [WITHDRAWAL_STATUS.APPROVED]: 'อนุมัติแล้ว',
  [WITHDRAWAL_STATUS.PAID]: 'จ่ายเงินแล้ว',
  [WITHDRAWAL_STATUS.REJECTED]: 'ปฏิเสธ',
}

const statusClasses: Record<WithdrawalStatus, string> = {
  [WITHDRAWAL_STATUS.PENDING]:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  [WITHDRAWAL_STATUS.APPROVED]:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  [WITHDRAWAL_STATUS.PAID]:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  [WITHDRAWAL_STATUS.REJECTED]:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
}

const methodLabels: Record<PaymentMethod, string> = { bank: 'โอนผ่านธนาคาร', promptpay: 'พร้อมเพย์' }
const statusNotes: Record<Exclude<WithdrawalStatus, typeof WITHDRAWAL_STATUS.PENDING>, string> = {
  [WITHDRAWAL_STATUS.APPROVED]: 'อนุมัติแล้วและอยู่ระหว่างรอจ่ายเงิน',
  [WITHDRAWAL_STATUS.PAID]: 'โอนเงินเรียบร้อยแล้ว',
  [WITHDRAWAL_STATUS.REJECTED]: 'ปฏิเสธคำขอโดยผู้ดูแลระบบ',
}

const money = (amount: number) => amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = (value: string) => new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

export default function TransactionsPage() {
  const { accessToken } = useAdminAuth()
  const [requests, setRequests] = useState<WithdrawalRequest[]>([])
  const [banks, setBanks] = useState<BankConfig[]>([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(true)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [status, setStatus] = useState<'all' | WithdrawalStatus>('all')
  const [method, setMethod] = useState<'all' | PaymentMethod>('all')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null)
  const [approvalRequest, setApprovalRequest] = useState<WithdrawalRequest | null>(null)
  const [transferProofName, setTransferProofName] = useState('')
  const [transferProofUrl, setTransferProofUrl] = useState('')
  const [isDraggingProof, setIsDraggingProof] = useState(false)
  const [transferProofError, setTransferProofError] = useState<string | null>(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [rejectionRequest, setRejectionRequest] = useState<WithdrawalRequest | null>(null)
  const [rejectionNote, setRejectionNote] = useState('')
  const [transferProofFile, setTransferProofFile] = useState<File | null>(null)
  const selectedBank = banks.find((bank) => bank.code === selectedRequest?.bankCode)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    void fetch(`${apiUrl}/writer/banks`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as { banks: BankConfig[] }
        if (!controller.signal.aborted) setBanks(body.banks)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [accessToken])

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!accessToken) return
    let isCurrentRequest = true

    setIsLoadingRequests(true)
    const query = new URLSearchParams()
    if (status !== 'all') query.set('status', status)
    if (appliedSearch) query.set('search', appliedSearch)
    const queryString = query.toString()
    const requestUrl = `${apiUrl}/admin/withdrawals${queryString ? `?${queryString}` : ''}`
    void fetch(requestUrl, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('ไม่สามารถโหลดคำขอถอนเงินได้')
        const body = (await response.json()) as {
          requests: Array<{
            id: string
            user: { display_name: string; username: string }
            requested_amount: string
            commission_amount: string
            net_amount: string
            bank_code: string
            account_number: string
            requested_at: string
            status: WithdrawalStatus
            note: string | null
            processed_by: string | null
            has_proof: boolean
          }>
        }
        if (isCurrentRequest)
          setRequests(
            body.requests.map((request) => ({
              id: request.id,
              user: { displayName: request.user.display_name, username: request.user.username },
              requestedAmount: Number(request.requested_amount),
              fee: Number(request.commission_amount),
              netAmount: Number(request.net_amount),
              paymentMethod: 'bank',
              bankCode: request.bank_code,
              accountNumber: request.account_number,
              submittedAt: request.requested_at,
              status: request.status,
              processedBy: request.processed_by,
              note: request.note,
              transferProofName: request.has_proof ? 'หลักฐานการโอน' : null,
              transferProofUrl: null,
            })),
          )
      })
      .catch(() => {
        if (isCurrentRequest) setRequests([])
      })
      .finally(() => {
        if (isCurrentRequest) setIsLoadingRequests(false)
      })

    return () => {
      isCurrentRequest = false
    }
  }, [accessToken, appliedSearch, status])

  const filteredRequests = useMemo(() => {
    const now = Date.now()
    const rangeInMilliseconds: Record<Exclude<DateRange, 'all'>, number> = {
      today: 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }

    return requests.filter((request) => {
      const matchesMethod = method === 'all' || request.paymentMethod === method
      const matchesDate =
        dateRange === 'all' || now - new Date(request.submittedAt).getTime() <= rangeInMilliseconds[dateRange]
      return matchesMethod && matchesDate
    })
  }, [dateRange, method, requests])

  async function copyAccountNumber(accountNumber: string) {
    try {
      await navigator.clipboard.writeText(accountNumber)
      toast.success('คัดลอกเลขบัญชีแล้ว')
    } catch {
      toast.error('ไม่สามารถคัดลอกได้ กรุณาเลือกเลขบัญชีแล้วคัดลอกด้วยตนเอง')
    }
  }

  async function updateStatus(
    requestId: string,
    nextStatus: Exclude<WithdrawalStatus, typeof WITHDRAWAL_STATUS.PENDING>,
    options: { proofName?: string; proofUrl?: string; proofFile?: File; note?: string } = {},
  ) {
    if (!accessToken) return
    const action =
      nextStatus === WITHDRAWAL_STATUS.APPROVED
        ? 'approve'
        : nextStatus === WITHDRAWAL_STATUS.REJECTED
          ? 'reject'
          : 'pay'
    const form = new FormData()
    form.set('action', action)
    if (options.note?.trim()) form.set('note', options.note.trim())
    if (options.proofFile) form.set('proof', options.proofFile)
    const response = await fetch(`${apiUrl}/admin/withdrawals/${requestId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      body: form,
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(body?.message ?? 'ไม่สามารถอัปเดตสถานะคำขอได้')
    }
    const updateRequest = (request: WithdrawalRequest): WithdrawalRequest =>
      request.id === requestId
        ? {
            ...request,
            status: nextStatus,
            processedBy: 'admin@Dopapage.com',
            note: options.note?.trim() || statusNotes[nextStatus],
            transferProofName:
              nextStatus === WITHDRAWAL_STATUS.APPROVED
                ? (options.proofName ?? request.transferProofName)
                : request.transferProofName,
            transferProofUrl:
              nextStatus === WITHDRAWAL_STATUS.APPROVED
                ? (options.proofUrl ?? request.transferProofUrl)
                : request.transferProofUrl,
          }
        : request

    setRequests((current) => current.map(updateRequest))
    setSelectedRequest((current) => (current?.id === requestId ? updateRequest(current) : current))
    toast.success(
      nextStatus === WITHDRAWAL_STATUS.APPROVED
        ? 'อนุมัติคำขอและส่งการแจ้งเตือนแล้ว'
        : nextStatus === WITHDRAWAL_STATUS.REJECTED
          ? 'ปฏิเสธคำขอและส่งการแจ้งเตือนแล้ว'
          : 'ยืนยันการจ่ายเงินแล้ว',
    )
  }

  async function approveRequest() {
    if (!approvalRequest || !transferProofName) return
    try {
      await updateStatus(approvalRequest.id, WITHDRAWAL_STATUS.APPROVED, {
        proofName: transferProofName,
        proofUrl: transferProofUrl,
        proofFile: transferProofFile ?? undefined,
        note: approvalNote,
      })
      closeApprovalDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถอนุมัติคำขอได้')
    }
  }

  async function rejectRequest() {
    if (!rejectionRequest || !rejectionNote.trim()) return
    try {
      await updateStatus(rejectionRequest.id, WITHDRAWAL_STATUS.REJECTED, { note: rejectionNote })
      setRejectionRequest(null)
      setRejectionNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถปฏิเสธคำขอได้')
    }
  }

  function selectTransferProof(file: File | undefined) {
    if (!file) return

    if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) {
      setTransferProofError('รองรับเฉพาะไฟล์ PNG, JPG และ PDF')
      return
    }

    setTransferProofName(file.name)
    setTransferProofUrl(URL.createObjectURL(file))
    setTransferProofFile(file)
    setTransferProofError(null)
  }

  function closeApprovalDialog() {
    setApprovalRequest(null)
    setTransferProofName('')
    setTransferProofUrl('')
    setTransferProofFile(null)
    setTransferProofError(null)
    setIsDraggingProof(false)
    setApprovalNote('')
  }

  async function openTransferProof(requestId: string) {
    if (!accessToken) return
    const response = await fetch(`${apiUrl}/admin/withdrawals/${requestId}/proof`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
    if (!response.ok) return
    const body = (await response.json()) as { url: string }
    window.open(body.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <main className="mx-auto w-full p-4 md:p-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Banknote className="size-6 text-primary" />
            คำขอถอนเงิน
          </h1>
        </div>

        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full space-y-2 sm:w-40">
                <Label>สถานะ</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as 'all' | WithdrawalStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{() => (status === 'all' ? 'ทั้งหมด' : statusLabels[status])}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full space-y-2 sm:w-44">
                <Label>ประเภท</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as 'all' | PaymentMethod)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{() => (method === 'all' ? 'ทั้งหมด' : methodLabels[method])}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {Object.entries(methodLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full space-y-2 sm:w-44">
                <Label>ช่วงเวลา</Label>
                <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {() =>
                        ({ all: 'ทั้งหมด', today: 'วันนี้', '7d': '7 วันที่ผ่านมา', '30d': '30 วันที่ผ่านมา' })[
                          dateRange
                        ]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    <SelectItem value="today">วันนี้</SelectItem>
                    <SelectItem value="7d">7 วันที่ผ่านมา</SelectItem>
                    <SelectItem value="30d">30 วันที่ผ่านมา</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative w-full sm:ml-auto sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหารหัสคำขอหรือผู้ใช้งาน"
                  aria-label="ค้นหาคำขอถอนเงิน"
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border bg-card shadow-none">
          <CardContent className="p-0">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead>เมื่อ</TableHead>
                  <TableHead>ผู้ขอถอน</TableHead>
                  <TableHead>บัญชีรับเงิน</TableHead>
                  <TableHead className="text-right">ยอดที่ขอถอน</TableHead>
                  <TableHead className="text-right">ยอดสุทธิ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>ผู้ดำเนินการ</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingRequests && requests.length === 0 ? (
                  Array.from({ length: 6 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="mt-2 h-3 w-24" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="mt-2 h-3 w-32" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="mt-2 h-3 w-20" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="ml-auto h-4 w-20" />
                        <Skeleton className="mt-2 ml-auto h-3 w-16" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="py-3">
                        <Skeleton className="ml-auto size-8" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredRequests.length ? (
                  filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="py-3">
                        <div className="font-medium">{dateTime(request.submittedAt)}</div>
                        <div className="text-xs text-muted-foreground">{request.id}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="font-medium">{request.user.displayName}</div>
                        <div className="text-xs text-muted-foreground">@{request.user.username}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="font-medium">
                          {request.bankCode} •••• {request.accountNumber.slice(-4)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {request.paymentMethod === 'bank' ? 'บัญชีธนาคาร' : 'หมายเลขพร้อมเพย์'}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-right font-medium">{money(request.requestedAmount)}</TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="font-medium text-primary">{money(request.netAmount)}</div>
                        <div className="text-xs text-muted-foreground">ค่าธรรมเนียม {money(request.fee)}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className={statusClasses[request.status]}>
                          {statusLabels[request.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-muted-foreground">{request.processedBy ?? '-'}</TableCell>
                      <TableCell className="max-w-48 py-3 whitespace-normal text-muted-foreground">
                        {request.note ?? '-'}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`จัดการ ${request.id}`}
                                title="จัดการสถานะ"
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedRequest(request)}>
                              <Eye />
                              ดูรายละเอียด
                            </DropdownMenuItem>
                            {request.status === WITHDRAWAL_STATUS.PENDING && (
                              <>
                                <DropdownMenuItem onClick={() => setApprovalRequest(request)}>
                                  <CheckCircle2 />
                                  อนุมัติ
                                </DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onClick={() => setRejectionRequest(request)}>
                                  <XCircle />
                                  ปฏิเสธ
                                </DropdownMenuItem>
                              </>
                            )}
                            {request.status === WITHDRAWAL_STATUS.APPROVED && (
                              <DropdownMenuItem onClick={() => void updateStatus(request.id, WITHDRAWAL_STATUS.PAID)}>
                                <CheckCircle2 />
                                ยืนยันการจ่ายเงิน
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      ไม่พบคำขอถอนเงิน
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog
          open={selectedRequest !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedRequest(null)
          }}
        >
          <DialogContent className="max-h-[calc(100svh-2rem)] max-w-xl gap-0 overflow-y-auto p-0 sm:max-w-xl">
            {selectedRequest && (
              <>
                <DialogHeader className="gap-3 border-b bg-accent/50 px-6 py-5 pr-12">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <DialogTitle className="text-lg">รายละเอียดคำขอถอนเงิน</DialogTitle>
                      <DialogDescription className="mt-1 font-mono text-xs">{selectedRequest.id}</DialogDescription>
                    </div>
                    <Badge variant="outline" className={statusClasses[selectedRequest.status]}>
                      {statusLabels[selectedRequest.status]}
                    </Badge>
                  </div>
                </DialogHeader>

                <div className="space-y-5 p-6">
                  <section className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">ยอดที่จะได้รับ</p>
                        <p className="mt-1 text-3xl font-semibold tracking-tight text-primary">
                          {money(selectedRequest.netAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-primary/15 p-2.5 text-primary">
                        <Banknote className="size-5" />
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-primary/15 pt-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">ยอดที่ขอถอน</p>
                        <p className="mt-1 font-medium">{money(selectedRequest.requestedAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ค่าธรรมเนียม</p>
                        <p className="mt-1 font-medium">{money(selectedRequest.fee)}</p>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-semibold">ข้อมูลคำขอ</p>
                    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                      <Detail
                        label="ผู้ขอถอน"
                        value={`${selectedRequest.user.displayName} (@${selectedRequest.user.username})`}
                      />
                      <Detail label="วันที่ส่งคำขอ" value={dateTime(selectedRequest.submittedAt)} />
                      <Detail label="ช่องทางรับเงิน" value={methodLabels[selectedRequest.paymentMethod]} />
                      <div className="space-y-1">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground">บัญชีรับเงิน</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedBank ? (
                            <img
                              src={`${apiUrl}/writer/${selectedBank.logo}`}
                              alt={selectedBank.name}
                              title={selectedBank.name}
                              className="size-7 shrink-0 object-contain"
                            />
                          ) : (
                            <span className="text-sm font-medium">{selectedRequest.bankCode}</span>
                          )}
                          <p className="select-text break-all text-sm font-medium">{selectedRequest.accountNumber}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="คัดลอกเลขบัญชีรับเงิน"
                            onClick={() => void copyAccountNumber(selectedRequest.accountNumber)}
                          >
                            <Copy />
                            คัดลอก
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-semibold">การดำเนินการ</p>
                    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                      <Detail label="ผู้ดำเนินการ" value={selectedRequest.processedBy ?? 'ยังไม่มีผู้ดำเนินการ'} />
                      <div className="space-y-1">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground">หลักฐานการโอน</p>
                        {selectedRequest.transferProofName ? (
                          <button
                            onClick={() => void openTransferProof(selectedRequest.id)}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                          >
                            <ExternalLink className="size-4" />
                            ดูหลักฐานการโอน
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-muted-foreground">ยังไม่มีไฟล์แนบ</p>
                        )}
                      </div>
                    </div>
                  </section>

                  {selectedRequest.note && (
                    <section className="rounded-xl border border-border bg-accent/30 p-4">
                      <Detail label="หมายเหตุ" value={selectedRequest.note} />
                    </section>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={approvalRequest !== null}
          onOpenChange={(open) => {
            if (!open) {
              closeApprovalDialog()
            }
          }}
        >
          <DialogContent className="max-w-md gap-5 sm:max-w-md">
            <DialogHeader className="pr-8">
              <DialogTitle className="text-lg">อนุมัติคำขอถอนเงิน</DialogTitle>
              <DialogDescription>
                แนบไฟล์หลักฐานการโอนสำหรับคำขอ {approvalRequest?.id} ก่อนอนุมัติคำขอ
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="transfer-proof">ไฟล์หลักฐาน</Label>
              <label
                htmlFor="transfer-proof"
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDraggingProof(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDraggingProof(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDraggingProof(false)
                  selectTransferProof(event.dataTransfer.files[0])
                }}
                className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${isDraggingProof ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-accent/40'}`}
              >
                <Input
                  id="transfer-proof"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  className="sr-only"
                  onChange={(event) => selectTransferProof(event.target.files?.[0])}
                />
                {transferProofName ? (
                  <>
                    <div className="rounded-full bg-primary/15 p-3 text-primary">
                      <FileText className="size-6" />
                    </div>
                    <p className="mt-3 max-w-full truncate font-medium">{transferProofName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">กดหรือลากไฟล์ใหม่เพื่อแทนที่</p>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-primary/15 p-3 text-primary">
                      <UploadCloud className="size-6" />
                    </div>
                    <p className="mt-3 font-medium">ลากไฟล์มาวางที่นี่</p>
                    <p className="mt-1 text-sm text-muted-foreground">หรือกดเพื่อเลือกไฟล์</p>
                  </>
                )}
              </label>
              <p className="text-xs text-muted-foreground">รองรับไฟล์ PNG, JPG และ PDF</p>
              {transferProofError && <p className="text-xs text-destructive">{transferProofError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-note">
                หมายเหตุสำหรับการอนุมัติ <span className="text-muted-foreground">(ไม่บังคับ)</span>
              </Label>
              <Textarea
                id="approval-note"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                placeholder="เช่น ตรวจสอบหลักฐานและข้อมูลบัญชีเรียบร้อยแล้ว"
                className="min-h-24 resize-none"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeApprovalDialog}>
                ยกเลิก
              </Button>
              <Button onClick={approveRequest} disabled={!transferProofName}>
                ยืนยันการอนุมัติ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={rejectionRequest !== null}
          onOpenChange={(open) => {
            if (!open) {
              setRejectionRequest(null)
              setRejectionNote('')
            }
          }}
        >
          <DialogContent className="max-w-md gap-5 sm:max-w-md">
            <DialogHeader className="pr-8">
              <DialogTitle className="text-lg">ปฏิเสธคำขอถอนเงิน</DialogTitle>
              <DialogDescription>ระบุเหตุผลที่ปฏิเสธสำหรับคำขอ {rejectionRequest?.id}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rejection-note">เหตุผลที่ปฏิเสธ</Label>
              <Textarea
                id="rejection-note"
                value={rejectionNote}
                onChange={(event) => setRejectionNote(event.target.value)}
                placeholder="เช่น ชื่อเจ้าของบัญชีไม่ตรงกับข้อมูลที่ลงทะเบียนไว้"
                className="min-h-28 resize-none"
              />
              <p className="text-xs text-muted-foreground">หมายเหตุนี้จะแสดงในรายละเอียดคำขอ</p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectionRequest(null)
                  setRejectionNote('')
                }}
              >
                ยกเลิก
              </Button>
              <Button variant="destructive" onClick={rejectRequest} disabled={!rejectionNote.trim()}>
                ยืนยันการปฏิเสธ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
