'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Columns3, List, LoaderCircle } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { useAuth } from '@/components/auth/auth-provider'
import { ChapterPurchaseDialog } from '@/components/content/chapter-purchase-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getPublicContentChapters } from '@/controllers/content.controller'
import type {
  PublicChapter,
  PublicChapterSort,
  PublicChaptersResponse,
} from '@/interface/content.interface'
import { SITE_CONFIG } from '@/site.config'
import { formatChapterNumber } from '@/utils/chapter-number.util'

function formatRelativeDate(value: string, referenceTime: number) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((referenceTime - new Date(value).getTime()) / 1000),
  )
  if (elapsedSeconds < 60) return 'เมื่อสักครู่'

  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes.toLocaleString('th-TH')} นาทีที่แล้ว`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours.toLocaleString('th-TH')} ชม.ที่แล้ว`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days.toLocaleString('th-TH')} วันที่แล้ว`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months.toLocaleString('th-TH')} เดือนที่แล้ว`

  const years = Math.floor(days / 365)
  return `${years.toLocaleString('th-TH')} ปีที่แล้ว`
}

export function PublicChapterList({
  slug,
  storyTitle,
  coverUrl,
  initialData,
  renderedAt,
}: {
  slug: string
  storyTitle: string
  coverUrl: string | null
  initialData: PublicChaptersResponse
  renderedAt: number
}) {
  const router = useRouter()
  const { accessToken, status } = useAuth()
  const [chapters, setChapters] = useState(initialData.chapters)
  const [pagination, setPagination] = useState(initialData.pagination)
  const [sort, setSort] = useState<PublicChapterSort>('chapter_desc')
  const [displayMode, setDisplayMode] = useState<'list' | 'grid'>('list')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [longPressChapterId, setLongPressChapterId] = useState<string | null>(null)
  const [isLongPressProgressActive, setIsLongPressProgressActive] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressProgressFrameRef = useRef<number | null>(null)
  const suppressNextClickRef = useRef(false)
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([])
  const [purchaseDialogChapters, setPurchaseDialogChapters] = useState<PublicChapter[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const requestInFlightRef = useRef(false)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const purchasableChapters = chapters.filter((chapter) => !chapter.can_read)
  const selectedChapters = purchasableChapters.filter((chapter) => (
    selectedChapterIds.includes(chapter.id)
  ))
  const allPurchasableSelected = purchasableChapters.length > 0
    && selectedChapters.length === purchasableChapters.length

  useEffect(() => {
    if (status === 'unauthenticated') {
      setChapters((current) => current.map((chapter) => ({
        ...chapter,
        is_purchased: false,
        is_owner: false,
        can_read: chapter.is_free,
      })))
    }
  }, [status])

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    if (longPressProgressFrameRef.current) cancelAnimationFrame(longPressProgressFrameRef.current)
  }, [])

  async function changeSort(nextSort: PublicChapterSort) {
    if (requestInFlightRef.current || nextSort === sort) return
    requestInFlightRef.current = true
    setIsLoading(true)
    setLoadError(false)

    try {
      const nextData = await getPublicContentChapters(
        slug,
        1,
        pagination.limit,
        nextSort,
        accessToken,
      )
      setChapters(nextData.chapters)
      setIsSelectionMode(false)
      setSelectedChapterIds([])
      setPurchaseDialogChapters([])
      setPagination(nextData.pagination)
      setSort(nextSort)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
      requestInFlightRef.current = false
    }
  }

  async function loadMore() {
    if (requestInFlightRef.current || !pagination.hasNextPage) return
    requestInFlightRef.current = true
    setIsLoading(true)
    setLoadError(false)

    try {
      const nextData = await getPublicContentChapters(
        slug,
        pagination.page + 1,
        pagination.limit,
        sort,
        accessToken,
      )
      setChapters((current) => [...current, ...nextData.chapters])
      setPagination(nextData.pagination)
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
      requestInFlightRef.current = false
    }
  }

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !pagination.hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore()
      },
      { rootMargin: '320px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [accessToken, pagination.hasNextPage, pagination.page, slug, sort])

  function markChaptersAsPurchased(chapterIds: string[]) {
    const purchasedIds = new Set(chapterIds)
    const purchasedChapter = purchaseDialogChapters.length === 1
      && purchasedIds.has(purchaseDialogChapters[0].id)
      ? purchaseDialogChapters[0]
      : null
    setChapters((current) => current.map((chapter) => (
      purchasedIds.has(chapter.id)
        ? { ...chapter, is_purchased: true, can_read: true }
        : chapter
    )))
    setSelectedChapterIds([])
    setIsSelectionMode(false)
    setPurchaseDialogChapters([])

    if (purchasedChapter) {
      router.push(
        `/content/${encodeURIComponent(slug)}/${encodeURIComponent(String(Number(purchasedChapter.chapter_number)))}`,
      )
    }
  }

  function toggleChapterSelection(chapterId: string) {
    setSelectedChapterIds((current) => (
      current.includes(chapterId)
        ? current.filter((id) => id !== chapterId)
        : [...current, chapterId]
    ))
  }

  function toggleAllPurchasable() {
    setSelectedChapterIds(
      allPurchasableSelected
        ? []
        : purchasableChapters.map((chapter) => chapter.id),
    )
  }

  function startLongPressSelection(chapter: PublicChapter) {
    if (chapter.can_read || isSelectionMode) return

    setLongPressChapterId(chapter.id)
    setIsLongPressProgressActive(false)
    longPressProgressFrameRef.current = requestAnimationFrame(() => {
      setIsLongPressProgressActive(true)
      longPressProgressFrameRef.current = null
    })
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressProgressActive(false)
      setLongPressChapterId(null)
      setIsSelectionMode(true)
      setSelectedChapterIds((current) => (
        current.includes(chapter.id) ? current : [...current, chapter.id]
      ))
      suppressNextClickRef.current = true
      longPressTimerRef.current = null
    }, 500)
  }

  function cancelLongPressSelection() {
    if (!longPressTimerRef.current) return
    clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
    if (longPressProgressFrameRef.current) {
      cancelAnimationFrame(longPressProgressFrameRef.current)
      longPressProgressFrameRef.current = null
    }
    setIsLongPressProgressActive(false)
    setLongPressChapterId(null)
  }

  return (
    <section
      aria-labelledby="chapter-list-heading"
      className="readji-surface mt-5 overflow-hidden rounded-[1.75rem]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="h-6 w-1 rounded-full bg-primary" />
          <h2 id="chapter-list-heading" className="text-lg font-extrabold text-foreground">
            รายการตอน
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {pagination.total.toLocaleString('th-TH')} ตอน
          </span>
          <Select
            value={sort}
            disabled={isLoading}
            onValueChange={(value) => void changeSort(value as PublicChapterSort)}
          >
            <SelectTrigger
              size="sm"
              aria-label="เรียงรายการตอน"
              className="w-[11.5rem] bg-card"
            >
              <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                <SelectItem value="latest">ล่าสุด</SelectItem>
                <SelectItem value="oldest">เก่าสุด</SelectItem>
                <SelectItem value="chapter_asc">
                  เรียงตามตอน น้อยไปมาก
                </SelectItem>
                <SelectItem value="chapter_desc">
                  เรียงตามตอน มากไปน้อย
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={displayMode === 'list' ? 'แสดงรายการตอนแบบ 3 คอลัมน์' : 'แสดงรายการตอนแบบแถวเดียว'}
                  onClick={() => setDisplayMode((current) => current === 'list' ? 'grid' : 'list')}
                >
                  {displayMode === 'list' ? <Columns3 /> : <List />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{displayMode === 'list' ? 'แสดงแบบ 3 คอลัมน์' : 'แสดงแบบแถวเดียว'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {purchasableChapters.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-4 py-3 sm:px-6">
          {isSelectionMode ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Checkbox
                  checked={allPurchasableSelected
                    ? true
                    : selectedChapters.length > 0
                      ? 'indeterminate'
                      : false}
                  onCheckedChange={toggleAllPurchasable}
                  className="cursor-pointer"
                />
                เลือกทั้งหมดในหน้านี้
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChapterIds([])
                    setIsSelectionMode(false)
                  }}
                  className="h-9 cursor-pointer rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={selectedChapters.length === 0}
                  onClick={() => setPurchaseDialogChapters(selectedChapters)}
                  className="h-9 cursor-pointer rounded-full bg-primary px-4 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  ซื้อ ({selectedChapters.length.toLocaleString('th-TH')})
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsSelectionMode(true)}
              className="ml-auto h-9 cursor-pointer rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              เลือกตอน
            </button>
          )}
        </div>
      ) : null}

      {chapters.length > 0 ? (
        <ol className={displayMode === 'grid' ? 'grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3' : 'divide-y divide-border/70'}>
          {chapters.map((chapter) => (
            <li
              key={chapter.id}
              data-selected={isSelectionMode && selectedChapterIds.includes(chapter.id) ? 'true' : undefined}
              className={`group relative isolate flex items-center overflow-hidden transition-colors duration-200 ${displayMode === 'grid' ? 'rounded-2xl border border-border/70' : ''} ${
                isSelectionMode && selectedChapterIds.includes(chapter.id)
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 sm:bg-transparent sm:text-inherit sm:hover:bg-accent/80'
                  : 'hover:bg-accent/80'
              }`}
            >
              {longPressChapterId === chapter.id ? (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 left-0 z-0 bg-primary/20 transition-[width] duration-500 ease-linear ${
                    isLongPressProgressActive ? 'w-full' : 'w-0'
                  }`}
                />
              ) : null}
              {!chapter.can_read && isSelectionMode ? (
                <Checkbox
                  checked={selectedChapterIds.includes(chapter.id)}
                  onCheckedChange={() => toggleChapterSelection(chapter.id)}
                  aria-label={`เลือกซื้อตอนที่ ${formatChapterNumber(chapter.chapter_number)}`}
                  className="relative z-10 ml-4 hidden cursor-pointer sm:ml-6 sm:flex"
                />
              ) : null}
              <button
                type="button"
                onPointerDown={(event) => {
                  if (event.pointerType === 'touch') startLongPressSelection(chapter)
                }}
                onPointerUp={cancelLongPressSelection}
                onPointerCancel={cancelLongPressSelection}
                onPointerLeave={cancelLongPressSelection}
                onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false
                    return
                  }

                  if (isSelectionMode && !chapter.can_read) {
                    toggleChapterSelection(chapter.id)
                    return
                  }

                  if (chapter.can_read) {
                    router.push(
                      `/content/${encodeURIComponent(slug)}/${encodeURIComponent(String(Number(chapter.chapter_number)))}`,
                    )
                  } else {
                    setPurchaseDialogChapters([chapter])
                  }
                }}
                className={`relative z-10 flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 text-left ${
                  chapter.can_read || !isSelectionMode ? 'px-4 sm:px-6' : 'px-4 sm:pr-6 sm:pl-3'
                }`}
              >
                <span className="flex min-w-10 shrink-0 items-center justify-center rounded-xl bg-secondary px-2 py-2.5 text-xs font-extrabold tabular-nums text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-data-[selected=true]:bg-primary-foreground/15 group-data-[selected=true]:text-primary-foreground sm:group-data-[selected=true]:bg-secondary sm:group-data-[selected=true]:text-secondary-foreground">
                  {formatChapterNumber(chapter.chapter_number)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary group-data-[selected=true]:text-primary-foreground sm:group-data-[selected=true]:text-foreground">
                    {chapter.title.trim() || `ตอนที่: ${formatChapterNumber(chapter.chapter_number)}`}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground group-data-[selected=true]:text-primary-foreground/75 sm:group-data-[selected=true]:text-muted-foreground">
                    {formatRelativeDate(chapter.published_at, renderedAt)}
                  </span>
                </span>
                {!chapter.can_read ? (
                  <span
                    aria-label={`${Number(chapter.price).toLocaleString('th-TH')} ${SITE_CONFIG.coinName}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary group-data-[selected=true]:bg-primary-foreground/15 group-data-[selected=true]:text-primary-foreground sm:group-data-[selected=true]:bg-primary/10 sm:group-data-[selected=true]:text-primary"
                  >
                    {Number(chapter.price).toLocaleString('th-TH')}
                    <GiTwoCoins
                      className="size-4 text-amber-500 drop-shadow-[0_1px_0_rgb(180_83_9_/_0.45)]"
                      aria-hidden="true"
                    />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          ยังไม่มีตอนที่เผยแพร่
        </p>
      )}

      {pagination.hasNextPage || isLoading || loadError ? (
        <div ref={loadMoreRef} className="border-t border-border/70 px-4 py-4 text-center sm:px-6">
          {loadError ? (
            <div>
              <p className="mb-3 text-sm text-destructive">
              โหลดรายการตอนเพิ่มเติมไม่สำเร็จ กรุณาลองใหม่
              </p>
              <Button type="button" variant="outline" size="sm" disabled={isLoading} onClick={() => void loadMore()}>
                ลองใหม่
              </Button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              กำลังโหลดตอนเพิ่มเติม...
            </div>
          ) : null}
        </div>
      ) : null}
      <ChapterPurchaseDialog
        chapters={purchaseDialogChapters}
        storyTitle={storyTitle}
        coverUrl={coverUrl}
        open={purchaseDialogChapters.length > 0}
        onOpenChange={(open) => {
          if (!open) setPurchaseDialogChapters([])
        }}
        onPurchased={markChaptersAsPurchased}
      />
    </section>
  )
}
