'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Download, RefreshCw, Search, ShoppingBag, X } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { toast } from 'sonner'
import type { DateRange } from 'react-day-picker'
import { th } from 'react-day-picker/locale'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCoin } from '@/utils/format-coin'

const PAGE_LIMIT = 20
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })
const dateOnly = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' })
const calendarYears = Array.from(
  { length: new Date().getFullYear() - 2000 + 1 },
  (_, index) => String(new Date().getFullYear() - index),
)

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) return 'เลือกช่วงวันที่'
  if (!range.to) return dateOnly.format(range.from)
  return `${dateOnly.format(range.from)} – ${dateOnly.format(range.to)}`
}

interface Purchase {
  id: string
  story_title: string
  story_slug: string
  cover_url: string | null
  chapter_number: string
  chapter_title: string
  price: string
  buyer_display_name: string
  buyer_username: string
  buyer_avatar_url: string | null
  writer_display_name: string
  writer_username: string
  writer_avatar_url: string | null
  purchased_at: string
}

interface PurchaseResponse {
  purchases: Purchase[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface StoryOption {
  id: string
  title: string
}

interface StoryOptionsResponse {
  stories: StoryOption[]
  pagination: { page: number; limit: number; hasNextPage: boolean }
}

interface UserOption {
  id: string
  display_name: string
  username: string
  avatar_url: string | null
}

interface UserOptionsResponse {
  users: UserOption[]
  pagination: { page: number; limit: number; hasNextPage: boolean }
}

export default function PurchasesPage() {
  const { accessToken } = useAdminAuth()
  const [selectedStory, setSelectedStory] = useState<StoryOption | null>(null)
  const [storyPickerOpen, setStoryPickerOpen] = useState(false)
  const [storySearch, setStorySearch] = useState('')
  const [appliedStorySearch, setAppliedStorySearch] = useState('')
  const [storyOptions, setStoryOptions] = useState<StoryOption[]>([])
  const [storyOptionsPage, setStoryOptionsPage] = useState(1)
  const [hasMoreStories, setHasMoreStories] = useState(false)
  const [isLoadingStories, setIsLoadingStories] = useState(false)
  const isLoadingStoriesRef = useRef(false)
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([])
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [appliedUserSearch, setAppliedUserSearch] = useState('')
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [userOptionsPage, setUserOptionsPage] = useState(1)
  const [hasMoreUsers, setHasMoreUsers] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const isLoadingUsersRef = useRef(false)
  const [selectedWriters, setSelectedWriters] = useState<UserOption[]>([])
  const [writerPickerOpen, setWriterPickerOpen] = useState(false)
  const [writerSearch, setWriterSearch] = useState('')
  const [appliedWriterSearch, setAppliedWriterSearch] = useState('')
  const [writerOptions, setWriterOptions] = useState<UserOption[]>([])
  const [writerOptionsPage, setWriterOptionsPage] = useState(1)
  const [hasMoreWriters, setHasMoreWriters] = useState(false)
  const [isLoadingWriters, setIsLoadingWriters] = useState(false)
  const isLoadingWritersRef = useRef(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [startCalendarMonth, setStartCalendarMonth] = useState(() => new Date())
  const [endCalendarMonth, setEndCalendarMonth] = useState(() => {
    const current = new Date()
    return new Date(current.getFullYear(), current.getMonth() + 1, 1)
  })
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PurchaseResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const dateFrom = dateRange?.from ? toDateValue(dateRange.from) : ''
  const dateTo = dateRange?.to ? toDateValue(dateRange.to) : ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedStorySearch(storySearch.trim())
      setStoryOptionsPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [storySearch])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedUserSearch(userSearch.trim())
      setUserOptionsPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [userSearch])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedWriterSearch(writerSearch.trim())
      setWriterOptionsPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [writerSearch])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (!accessToken || !storyPickerOpen) return
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(storyOptionsPage),
      limit: '20',
    })
    if (appliedStorySearch) query.set('search', appliedStorySearch)

    isLoadingStoriesRef.current = true
    setIsLoadingStories(true)
    void fetch(`${apiUrl}/admin/purchases/stories?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as StoryOptionsResponse | { message?: string }
        if (!response.ok) throw new Error('ไม่สามารถโหลดรายการเรื่องได้')
        if (!controller.signal.aborted) {
          const result = body as StoryOptionsResponse
          setStoryOptions((current) => storyOptionsPage === 1 ? result.stories : [...current, ...result.stories])
          setHasMoreStories(result.pagination.hasNextPage)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && storyOptionsPage === 1) setStoryOptions([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          isLoadingStoriesRef.current = false
          setIsLoadingStories(false)
        }
      })

    return () => controller.abort()
  }, [accessToken, appliedStorySearch, storyOptionsPage, storyPickerOpen])

  useEffect(() => {
    if (!accessToken || !userPickerOpen) return
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(userOptionsPage),
      limit: '20',
    })
    if (appliedUserSearch) query.set('search', appliedUserSearch)

    isLoadingUsersRef.current = true
    setIsLoadingUsers(true)
    void fetch(`${apiUrl}/admin/purchases/users?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as UserOptionsResponse | { message?: string }
        if (!response.ok) throw new Error('ไม่สามารถโหลดรายชื่อผู้ใช้งานได้')
        if (!controller.signal.aborted) {
          const result = body as UserOptionsResponse
          setUserOptions((current) => userOptionsPage === 1 ? result.users : [...current, ...result.users])
          setHasMoreUsers(result.pagination.hasNextPage)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && userOptionsPage === 1) setUserOptions([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          isLoadingUsersRef.current = false
          setIsLoadingUsers(false)
        }
      })

    return () => controller.abort()
  }, [accessToken, appliedUserSearch, userOptionsPage, userPickerOpen])

  useEffect(() => {
    if (!accessToken || !writerPickerOpen) return
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(writerOptionsPage),
      limit: '20',
    })
    if (appliedWriterSearch) query.set('search', appliedWriterSearch)

    isLoadingWritersRef.current = true
    setIsLoadingWriters(true)
    void fetch(`${apiUrl}/admin/purchases/writers?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as UserOptionsResponse | { message?: string }
        if (!response.ok) throw new Error('Unable to load writers')
        if (!controller.signal.aborted) {
          const result = body as UserOptionsResponse
          setWriterOptions((current) => writerOptionsPage === 1 ? result.users : [...current, ...result.users])
          setHasMoreWriters(result.pagination.hasNextPage)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && writerOptionsPage === 1) setWriterOptions([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          isLoadingWritersRef.current = false
          setIsLoadingWriters(false)
        }
      })

    return () => controller.abort()
  }, [accessToken, appliedWriterSearch, writerOptionsPage, writerPickerOpen])

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    const query = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) })
    if (selectedStory) query.set('story_id', selectedStory.id)
    if (selectedUsers.length) query.set('user_ids', selectedUsers.map((user) => user.id).join(','))
    if (selectedWriters.length) query.set('writer_ids', selectedWriters.map((writer) => writer.id).join(','))
    if (dateFrom) query.set('date_from', dateFrom)
    if (dateTo) query.set('date_to', dateTo)

    setIsLoading(true)
    setError(null)
    void fetch(`${apiUrl}/admin/purchases?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as PurchaseResponse | { message?: string }
        if (!response.ok) throw new Error('message' in body ? body.message : 'ไม่สามารถโหลดประวัติการซื้อได้')
        if (!controller.signal.aborted) setData(body as PurchaseResponse)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'ไม่สามารถโหลดประวัติการซื้อได้')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [accessToken, selectedStory, selectedUsers, selectedWriters, dateFrom, dateTo, page, reloadKey])

  function clearFilters() {
    setSelectedStory(null)
    setStorySearch('')
    setAppliedStorySearch('')
    setStoryOptions([])
    setStoryOptionsPage(1)
    setSelectedUsers([])
    setUserSearch('')
    setAppliedUserSearch('')
    setUserOptions([])
    setUserOptionsPage(1)
    setSelectedWriters([])
    setWriterSearch('')
    setAppliedWriterSearch('')
    setWriterOptions([])
    setWriterOptionsPage(1)
    setDateRange(undefined)
    setPage(1)
  }

  async function exportFilteredPurchases() {
    if (!accessToken || isExporting) return

    setIsExporting(true)
    try {
      const purchases: Purchase[] = []
      let exportPage = 1
      let totalPages = 1

      do {
        const query = new URLSearchParams({ page: String(exportPage), limit: '100' })
        if (selectedStory) query.set('story_id', selectedStory.id)
        if (selectedUsers.length) query.set('user_ids', selectedUsers.map((user) => user.id).join(','))
        if (selectedWriters.length) query.set('writer_ids', selectedWriters.map((writer) => writer.id).join(','))
        if (dateFrom) query.set('date_from', dateFrom)
        if (dateTo) query.set('date_to', dateTo)

        const response = await fetch(`${apiUrl}/admin/purchases?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        })
        const body = await response.json() as PurchaseResponse | { message?: string }
        if (!response.ok) throw new Error('message' in body ? body.message : 'ไม่สามารถส่งออกข้อมูลได้')

        const result = body as PurchaseResponse
        purchases.push(...result.purchases)
        totalPages = result.pagination.totalPages
        exportPage += 1
      } while (exportPage <= totalPages)

      const XLSX = await import('xlsx')
      const worksheet = XLSX.utils.json_to_sheet(purchases.map((purchase) => ({
        เรื่อง: purchase.story_title,
        ตอน: `${Number(purchase.chapter_number)} ${purchase.chapter_title}`,
        ผู้ซื้อ: purchase.buyer_display_name,
        'Username ผู้ซื้อ': purchase.buyer_username,
        นักเขียน: purchase.writer_display_name,
        'Username นักเขียน': purchase.writer_username,
        ราคา: Number(purchase.price),
        วันที่ซื้อ: dateTime.format(new Date(purchase.purchased_at)),
      })))
      worksheet['!cols'] = [
        { wch: 36 }, { wch: 32 }, { wch: 24 }, { wch: 24 },
        { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 24 },
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ประวัติการซื้อ')
      XLSX.writeFile(workbook, `ประวัติการซื้อ-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`ส่งออก ${purchases.length.toLocaleString('th-TH')} รายการแล้ว`)
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : 'ไม่สามารถส่งออกข้อมูลได้')
    } finally {
      setIsExporting(false)
    }
  }

  const hasFilters = Boolean(selectedStory || selectedUsers.length || selectedWriters.length || dateRange?.from)

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ประวัติการซื้อ</h1>
          <p className="mt-1 text-sm text-muted-foreground">ตรวจสอบการซื้อตอนทั้งหมดภายในเว็บไซต์</p>
        </div>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
          <ShoppingBag className="size-3.5" />
          {data?.pagination.total ?? 0} รายการ
        </Badge>
      </div>

      <Card>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(11rem,1.2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(12rem,1fr)_auto_auto] md:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-story">เรื่อง</Label>
            <Popover open={storyPickerOpen} onOpenChange={(open) => {
              setStoryPickerOpen(open)
              if (open) setStoryOptionsPage(1)
            }}>
              <PopoverTrigger
                render={<Button id="purchase-story" type="button" variant="outline" className="w-full justify-start bg-transparent text-left font-normal"><span className="truncate">{selectedStory?.title ?? 'เลือกเรื่อง'}</span></Button>}
              />
              <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={storySearch} onChange={(event) => setStorySearch(event.target.value)} placeholder="ค้นหาชื่อเรื่อง" className="pl-8" autoFocus />
                </div>
                <div
                  className="mt-2 max-h-64 overflow-y-auto"
                  onScroll={(event) => {
                    const target = event.currentTarget
                    if (hasMoreStories && !isLoadingStoriesRef.current && target.scrollHeight - target.scrollTop - target.clientHeight < 64) {
                      setStoryOptionsPage((current) => current + 1)
                    }
                  }}
                >
                  {storyOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedStory(option)
                        setPage(1)
                        setStoryPickerOpen(false)
                      }}
                      className={`flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${selectedStory?.id === option.id ? 'bg-accent font-medium' : ''}`}
                    >
                      <span className="truncate">{option.title}</span>
                    </button>
                  ))}
                  {!isLoadingStories && storyOptions.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">ไม่พบเรื่องที่มีประวัติการซื้อ</p>}
                  {isLoadingStories && <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />กำลังโหลด...</div>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-users">ผู้ซื้อ</Label>
            <Popover open={userPickerOpen} onOpenChange={(open) => {
              setUserPickerOpen(open)
              if (open) setUserOptionsPage(1)
            }}>
              <PopoverTrigger
                render={<Button id="purchase-users" type="button" variant="outline" className="w-full justify-start bg-transparent text-left font-normal"><span className="truncate">{selectedUsers.length ? `เลือกแล้ว ${selectedUsers.length} คน` : 'เลือกผู้ซื้อ'}</span></Button>}
              />
              <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="ค้นหาชื่อหรือ username" className="pl-8" autoFocus />
                </div>
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-b py-2">
                    {selectedUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelectedUsers((current) => current.filter((selected) => selected.id !== user.id))
                          setPage(1)
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium hover:bg-accent/70"
                      >
                        @{user.username}
                        <X className="size-3" />
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className="mt-2 max-h-64 overflow-y-auto"
                  onScroll={(event) => {
                    const target = event.currentTarget
                    if (hasMoreUsers && !isLoadingUsersRef.current && target.scrollHeight - target.scrollTop - target.clientHeight < 64) {
                      setUserOptionsPage((current) => current + 1)
                    }
                  }}
                >
                  {userOptions.map((user) => {
                    const isSelected = selectedUsers.some((selected) => selected.id === user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelectedUsers((current) => isSelected ? current.filter((selected) => selected.id !== user.id) : [...current, user])
                          setPage(1)
                        }}
                        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
                      >
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{user.username.slice(0, 1).toUpperCase()}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{user.display_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
                        </span>
                        {isSelected && <span className="text-xs font-medium text-primary">เลือกแล้ว</span>}
                      </button>
                    )
                  })}
                  {!isLoadingUsers && userOptions.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">ไม่พบผู้ซื้อที่มีประวัติการซื้อ</p>}
                  {isLoadingUsers && <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />กำลังโหลด...</div>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="purchase-writers">นักเขียน</Label>
            <Popover open={writerPickerOpen} onOpenChange={(open) => {
              setWriterPickerOpen(open)
              if (open) setWriterOptionsPage(1)
            }}>
              <PopoverTrigger
                render={<Button id="purchase-writers" type="button" variant="outline" className="w-full justify-start bg-transparent text-left font-normal"><span className="truncate">{selectedWriters.length ? `เลือกแล้ว ${selectedWriters.length} คน` : 'เลือกนักเขียน'}</span></Button>}
              />
              <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={writerSearch} onChange={(event) => setWriterSearch(event.target.value)} placeholder="ค้นหาชื่อหรือ username" className="pl-8" autoFocus />
                </div>
                {selectedWriters.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-b py-2">
                    {selectedWriters.map((writer) => (
                      <button key={writer.id} type="button" onClick={() => { setSelectedWriters((current) => current.filter((selected) => selected.id !== writer.id)); setPage(1) }} className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium hover:bg-accent/70">
                        @{writer.username}<X className="size-3" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 max-h-64 overflow-y-auto" onScroll={(event) => {
                  const target = event.currentTarget
                  if (hasMoreWriters && !isLoadingWritersRef.current && target.scrollHeight - target.scrollTop - target.clientHeight < 64) setWriterOptionsPage((current) => current + 1)
                }}>
                  {writerOptions.map((writer) => {
                    const isSelected = selectedWriters.some((selected) => selected.id === writer.id)
                    return (
                      <button key={writer.id} type="button" onClick={() => { setSelectedWriters((current) => isSelected ? current.filter((selected) => selected.id !== writer.id) : [...current, writer]); setPage(1) }} className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}>
                        {writer.avatar_url ? <img src={writer.avatar_url} alt="" className="size-8 shrink-0 rounded-full object-cover" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{writer.username.slice(0, 1).toUpperCase()}</span>}
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{writer.display_name}</span><span className="block truncate text-xs text-muted-foreground">@{writer.username}</span></span>
                        {isSelected && <span className="text-xs font-medium text-primary">เลือกแล้ว</span>}
                      </button>
                    )
                  })}
                  {!isLoadingWriters && writerOptions.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">ไม่พบนักเขียนที่มีประวัติการขาย</p>}
                  {isLoadingWriters && <div className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />กำลังโหลด...</div>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-2">
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
                    <Calendar locale={th} mode="single" selected={dateRange?.from} onSelect={(date) => {
                      if (!date) return setDateRange(undefined)
                      setDateRange((current) => ({ from: date, to: current?.to && current.to >= date ? current.to : undefined }))
                      setStartCalendarMonth(date)
                    }} month={startCalendarMonth} onMonthChange={setStartCalendarMonth} />
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
                    <Calendar locale={th} mode="single" selected={dateRange?.to} disabled={dateRange?.from ? { before: dateRange.from } : undefined} onSelect={(date) => {
                      if (!date) return
                      setDateRange((current) => current?.from ? { from: current.from, to: date } : { from: date })
                      setEndCalendarMonth(date)
                    }} month={endCalendarMonth} onMonthChange={setEndCalendarMonth} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button type="button" variant="outline" className="whitespace-nowrap bg-transparent px-3" onClick={() => void exportFilteredPurchases()} disabled={isExporting}>
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
                ลองใหม่
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>เรื่อง / ตอน</TableHead>
                    <TableHead>ผู้ซื้อ</TableHead>
                    <TableHead>นักเขียน</TableHead>
                    <TableHead className="text-right">ราคา</TableHead>
                    <TableHead>วันที่ซื้อ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && !data ? (
                    Array.from({ length: 8 }, (_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 5 }, (_, cell) => (
                          <TableCell key={cell}>
                            <Skeleton className="h-5 w-28" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : data?.purchases.length ? (
                    data.purchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                              {purchase.cover_url ? (
                                <img src={purchase.cover_url} alt="" className="size-full object-cover" />
                              ) : (
                                <ShoppingBag className="size-4 text-muted-foreground" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-72 truncate font-medium">{purchase.story_title}</p>
                              <p className="max-w-72 truncate text-xs text-muted-foreground">
                                ตอนที่ {Number(purchase.chapter_number)} · {purchase.chapter_title}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {purchase.buyer_avatar_url ? <img src={purchase.buyer_avatar_url} alt="" className="size-8 shrink-0 rounded-full object-cover" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{purchase.buyer_username.slice(0, 1).toUpperCase()}</span>}
                            <div className="min-w-0"><p className="truncate font-medium">{purchase.buyer_display_name}</p><p className="truncate text-xs text-muted-foreground">@{purchase.buyer_username}</p></div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {purchase.writer_avatar_url ? <img src={purchase.writer_avatar_url} alt="" className="size-8 shrink-0 rounded-full object-cover" /> : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{purchase.writer_username.slice(0, 1).toUpperCase()}</span>}
                            <div className="min-w-0"><p className="truncate font-medium">{purchase.writer_display_name}</p><p className="truncate text-xs text-muted-foreground">@{purchase.writer_username}</p></div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <GiTwoCoins className="size-4 text-amber-500" />
                            {formatCoin(purchase.price)}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {dateTime.format(new Date(purchase.purchased_at))}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-36 text-center text-muted-foreground">
                        ไม่พบรายการซื้อตามตัวกรอง
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-sm text-muted-foreground">
            หน้า {data?.pagination.page ?? 1} จาก {data?.pagination.totalPages ?? 1}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading || page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft />
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading || !data || page >= data.pagination.totalPages}
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
