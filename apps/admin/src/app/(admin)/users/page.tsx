'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Search, Users } from 'lucide-react'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { formatPhoneNumber } from '@/utils/phone-number'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'
import { formatCoin } from '@/utils/format-coin'

type UserStatus = 'active' | 'banned'

interface AdminUser {
  id: string
  email: string
  phone_number: string | null
  username: string
  display_name: string
  balance: string
  topup_total: string
  purchase_count: string
  purchase_total: string
  role: 'user'
  status: UserStatus
  last_login_at: string | null
  created_at: string
}

interface UsersResponse {
  users: AdminUser[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface UserForm {
  display_name: string
  username: string
  email: string
  phone_number: string
  status: UserStatus
  balance: string
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const statusLabels: Record<UserStatus, string> = { active: 'ใช้งาน', banned: 'แบน' }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value))
}

function getForm(user: AdminUser): UserForm {
  return {
    display_name: user.display_name,
    username: user.username,
    email: user.email,
    phone_number: formatPhoneNumber(user.phone_number),
    status: user.status,
    balance: Number(user.balance).toFixed(2),
  }
}

export default function UsersPage() {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const { accessToken } = useAdminAuth()
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [status, setStatus] = useState<'all' | UserStatus>('all')
  const [data, setData] = useState<UsersResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<UserForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    if (!accessToken) return

    setLoading(true)
    setError(null)
    const query = new URLSearchParams({ page: String(page), limit: '20' })
    if (submittedSearch) query.set('search', submittedSearch)
    if (status !== 'all') query.set('status', status)

    try {
      const response = await fetch(`${apiUrl}/admin/users?${query}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      })
      const body = (await response.json().catch(() => null)) as UsersResponse | { message?: string } | null
      if (!response.ok) throw new Error(body && 'message' in body ? body.message : 'ไม่สามารถโหลดรายชื่อผู้ใช้งานได้')
      setData(body as UsersResponse)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ไม่สามารถโหลดรายชื่อผู้ใช้งานได้')
    } finally {
      setLoading(false)
    }
  }, [accessToken, page, status, submittedSearch])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const applySearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setSubmittedSearch(search.trim())
  }

  const changeStatus = (value: string | null) => {
    setStatus(value === 'active' || value === 'banned' ? value : 'all')
    setPage(1)
  }

  const openEditDialog = (user: AdminUser) => {
    setSelectedUser(user)
    setForm(getForm(user))
    setFormError(null)
  }

  const closeEditDialog = () => {
    if (saving) return
    setSelectedUser(null)
    setForm(null)
    setFormError(null)
  }

  const updateForm = <Key extends keyof UserForm>(key: Key, value: UserForm[Key]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  const saveUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedUser || !form || !accessToken) return

    setSaving(true)
    setFormError(null)
    try {
      const response = await fetch(`${apiUrl}/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          display_name: form.display_name.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          phone_number: form.phone_number.trim() || null,
        }),
      })
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) throw new Error(body?.message ?? 'ไม่สามารถบันทึกข้อมูลผู้ใช้งานได้')

      setSelectedUser(null)
      setForm(null)
      await loadUsers()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'ไม่สามารถบันทึกข้อมูลผู้ใช้งานได้')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="size-6 text-primary" />
          ผู้ใช้ทั้งหมด
        </h1>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b">
          <div>
            <CardTitle>
              {data ? `พบผู้ใช้งาน ${data.pagination.total.toLocaleString('th-TH')} ราย` : 'กำลังโหลดข้อมูลผู้ใช้งาน'}
            </CardTitle>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form onSubmit={applySearch} className="flex flex-1 gap-2 sm:min-w-80">
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
            <Select value={status} onValueChange={changeStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue>{() => (status === 'all' ? 'ทุกสถานะ' : statusLabels[status])}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectItem value="all">ทุกสถานะ</SelectItem>
                <SelectItem value="active">ใช้งาน</SelectItem>
                <SelectItem value="banned">ถูกแบน</SelectItem>
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
                  <TableHead>ผู้ใช้งาน</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">{SITE_CONFIG.coinName}ทั้งหมด</TableHead>
                  <TableHead className="text-right">{SITE_CONFIG.coinName}คงเหลือ</TableHead>
                  <TableHead>เริ่มใช้งาน</TableHead>
                  <TableHead>เข้าใช้ล่าสุด</TableHead>
                  <TableHead>ข้อมูลการซื้อ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Skeleton className="h-9 w-52" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="ml-auto h-8 w-20" />
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.users.length ? (
                  data.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.display_name}</div>
                        <div className="text-xs text-muted-foreground">
                          @{user.username} · {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.status === 'active'
                              ? 'secondary'
                              : user.status === 'banned'
                                ? 'destructive'
                                : 'outline'
                          }
                        >
                          {statusLabels[user.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(user.topup_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCoin(user.balance)}</TableCell>
                      <TableCell>{formatDate(user.created_at)}</TableCell>
                      <TableCell>{user.last_login_at ? formatDate(user.last_login_at) : 'ยังไม่เคยเข้าใช้'}</TableCell>
                      <TableCell>
                        <div>{Number(user.purchase_count).toLocaleString('th-TH')} ตอน</div>
                        <div className="text-xs text-muted-foreground">{formatCoin(user.purchase_total)} {SITE_CONFIG.coinName}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(user)}>
                          <Pencil />
                          จัดการ
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข
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

      <Dialog
        open={Boolean(selectedUser)}
        onOpenChange={(open) => {
          if (!open) closeEditDialog()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลของ {selectedUser?.display_name}</DialogTitle>
          </DialogHeader>
          {form && (
            <form onSubmit={saveUser} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="display_name">ชื่อที่แสดง</Label>
                <Input
                  id="display_name"
                  value={form.display_name}
                  onChange={(event) => updateForm('display_name', event.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(event) => updateForm('username', event.target.value)}
                  disabled
                  required
                  minLength={3}
                  maxLength={30}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm('email', event.target.value)}
                  disabled
                  required
                  maxLength={320}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone_number">เบอร์โทรศัพท์</Label>
                <Input
                  id="phone_number"
                  type="tel"
                  value={form.phone_number}
                  onChange={(event) => updateForm('phone_number', event.target.value)}
                  placeholder="0812345678"
                  pattern="^(?:0[0-9]{9}|\\+[1-9][0-9]{7,14})$"
                  title="กรุณากรอกเบอร์โทรศัพท์ 10 หลัก เช่น 0812345678"
                  inputMode="tel"
                  maxLength={16}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="balance">ยอด{SITE_CONFIG.coinName}</Label>
                <Input
                  id="balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.balance}
                  onChange={(event) => updateForm('balance', event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>สถานะบัญชี</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => {
                    if (value === 'active' || value === 'banned') updateForm('status', value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>{statusLabels[form.status]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="active">ใช้งาน</SelectItem>
                    <SelectItem value="banned">แบน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeEditDialog} disabled={saving}>
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
