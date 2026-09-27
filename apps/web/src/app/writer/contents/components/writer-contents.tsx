'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StoryStatus, StoryType } from '@/constants/story.constant'
import { deleteWriterContent, getMyContents } from '@/controllers/writer.controller'
import type {
  WriterContent,
  WriterContentTab,
  WriterContentsResponse,
} from '@/interface/writer-content.interface'
import { CreateContentDialog } from './create-content-dialog'
import { BookOpenIcon, LockKeyholeIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'

const PAGE_LIMIT = 10

const tabLabels: Record<WriterContentTab, string> = {
  novel: 'นิยาย',
  cartoon: 'การ์ตูน',
}

const typeLabels: Record<StoryType, string> = {
  [StoryType.NOVEL]: 'นิยาย',
  [StoryType.MANGA]: 'การ์ตูน',
}

const statusLabels: Record<StoryStatus, string> = {
  [StoryStatus.DRAFT]: 'ฉบับร่าง',
  [StoryStatus.ONGOING]: 'เผยแพร่',
  [StoryStatus.COMPLETED]: 'จบแล้ว',
  [StoryStatus.HIATUS]: 'หยุดชั่วคราว',
  [StoryStatus.CANCELLED]: 'ยกเลิก',
}

function statusVariant(status: StoryStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === StoryStatus.ONGOING) return 'outline'
  if (status === StoryStatus.DRAFT) return 'secondary'
  if (status === StoryStatus.CANCELLED) return 'destructive'
  return 'outline'
}

function formatNumber(value: string): string {
  return new Intl.NumberFormat('th-TH').format(Number(value))
}

function formatCoin(value: string): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function SystemSuspensionLock({ content }: { content: WriterContent }) {
  if (content.moderation_status !== 'locked') return null

  return (
    <span
      title="ผลงานนี้ถูกระงับโดยระบบ และจะไม่แสดงต่อผู้อ่านจนกว่าแอดมินจะเปิดใช้งานอีกครั้ง"
      aria-label="ผลงานถูกระงับโดยระบบ"
      className="inline-flex shrink-0 text-destructive"
    >
      <LockKeyholeIcon className="size-4" aria-hidden="true" />
    </span>
  )
}

function ContentStatusBadge({ content, className }: { content: WriterContent; className?: string }) {
  const isLocked = content.moderation_status === 'locked'
  const isPublished = !isLocked && content.status === StoryStatus.ONGOING

  return (
    <Badge
      className={`${isPublished ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''} ${className ?? ''}`}
      variant={isLocked ? 'destructive' : statusVariant(content.status)}
    >
      {isLocked ? 'ล็อค' : statusLabels[content.status]}
    </Badge>
  )
}

function ManageContentActions({ contentId, onDelete }: { contentId: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
      <Button asChild variant="link" size="sm" className="h-auto p-0 text-amber-600 hover:text-amber-700">
        <Link href={`/writer/content/${contentId}/content`}>
          <PencilIcon />
          จัดการ
        </Link>
      </Button>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-destructive hover:text-destructive/80"
        onClick={onDelete}
      >
        <Trash2Icon />
        ลบ
      </Button>
    </div>
  )
}

function LoadingRows({ isVisible }: { isVisible: boolean }) {
  return Array.from({ length: PAGE_LIMIT }, (_, index) => (
    <TableRow
      key={index}
      className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <TableCell className="px-3 py-2"><Skeleton className="h-14 w-52" /></TableCell>
      <TableCell className="px-3 py-2"><Skeleton className="h-9 w-28" /></TableCell>
      <TableCell className="px-3 py-2 text-right"><Skeleton className="ml-auto h-5 w-10" /></TableCell>
      <TableCell className="px-3 py-2 text-right"><Skeleton className="ml-auto h-5 w-12" /></TableCell>
      <TableCell className="px-3 py-2 text-right"><Skeleton className="ml-auto h-5 w-10" /></TableCell>
      <TableCell className="px-3 py-2"><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell className="px-3 py-2"><Skeleton className="h-9 w-20" /></TableCell>
      <TableCell className="px-3 py-2"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
      <TableCell className="px-3 py-2"><Skeleton className="h-5 w-20" /></TableCell>
      <TableCell className="px-3 py-2 text-right"><Skeleton className="ml-auto h-5 w-28" /></TableCell>
    </TableRow>
  ))
}

function LoadingCards({ isVisible }: { isVisible: boolean }) {
  return (
    <div
      className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-3 border-b p-3 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

interface WriterContentsProps {
  activeTab: WriterContentTab
  page: number
}

export function WriterContents({ activeTab, page }: WriterContentsProps) {
  const router = useRouter()
  const { accessToken } = useAuth()
  const [result, setResult] = useState<WriterContentsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [contentToDelete, setContentToDelete] = useState<WriterContent | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return

    let cancelled = false
    setIsLoading(true)
    setHasError(false)

    void getMyContents(activeTab, page, PAGE_LIMIT, accessToken)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult)
      })
      .catch(() => {
        if (!cancelled) setHasError(true)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, activeTab, page])

  useEffect(() => {
    if (isLoading) {
      setShowSkeleton(true)
      setShowContent(false)
      return
    }

    let revealTimer: number | undefined
    const fadeTimer = window.setTimeout(() => {
      setShowSkeleton(false)
      revealTimer = window.setTimeout(() => setShowContent(true), 50)
    }, 300)

    return () => {
      window.clearTimeout(fadeTimer)
      if (revealTimer !== undefined) window.clearTimeout(revealTimer)
    }
  }, [isLoading])

  const changeTab = (value: string) => {
    router.push(`/writer/contents?tab=${value}`)
  }

  const changePage = (nextPage: number) => {
    router.push(`/writer/contents?tab=${activeTab}&page=${nextPage}`)
  }

  const confirmDelete = async () => {
    if (!accessToken || !contentToDelete || isDeleting) return

    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteWriterContent(contentToDelete.id, accessToken)
      setContentToDelete(null)
      if ((result?.contents.length ?? 0) <= 1 && page > 1) {
        changePage(page - 1)
      } else {
        setResult((current) => {
          if (!current) return current
          const total = Math.max(0, current.pagination.total - 1)
          return {
            contents: current.contents.filter((content) => content.id !== contentToDelete.id),
            pagination: {
              ...current.pagination,
              total,
              totalPages: Math.ceil(total / current.pagination.limit),
            },
          }
        })
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'ไม่สามารถลบผลงานได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsDeleting(false)
    }
  }

  const contents = result?.contents ?? []
  const pagination = result?.pagination
  const showResolvedState = !isLoading && !showSkeleton
  const contentOpacity = showContent ? 'opacity-100' : 'opacity-0'

  return (
    <main className="min-w-0 flex-1 px-4 py-4 md:px-5 md:py-5">
      <div className="mx-auto">
        <Tabs value={activeTab} onValueChange={changeTab} className="block">
          <div className="relative flex flex-col gap-3 lg:min-h-10 lg:block">
            <TabsList
              aria-label="ประเภทผลงาน"
              className="readji-surface mx-auto flex h-auto w-fit rounded-xl bg-white p-1"
            >
              {(Object.entries(tabLabels) as [WriterContentTab, string][]).map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-8 min-w-24 flex-none rounded-lg px-4 py-1.5 text-sm font-bold text-muted-foreground shadow-none hover:bg-accent hover:text-foreground sm:min-w-28 sm:px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <CreateContentDialog defaultType={activeTab} />
          </div>

          <TabsContent
            value={activeTab}
            className="mt-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
          >
          <div className="md:hidden">
            {showSkeleton && <LoadingCards isVisible={isLoading} />}

            {showResolvedState && (
              <div
                className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${contentOpacity}`}
              >
                {hasError && (
                  <div className="px-4 py-8 text-center text-sm text-destructive">
                    ไม่สามารถโหลดผลงานได้ กรุณาลองใหม่อีกครั้ง
                  </div>
                )}

                {!hasError && contents.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    ยังไม่มี{tabLabels[activeTab]}
                  </div>
                )}

                {!hasError && contents.map((content) => (
              <article
                key={content.id}
                className={`border-b p-3 last:border-b-0 ${
                  content.moderation_status === 'locked' ? 'bg-destructive/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="flex min-w-0 items-start gap-1.5 text-sm font-semibold break-words">
                    <span>{content.title}</span>
                    <SystemSuspensionLock content={content} />
                  </h2>
                  <ContentStatusBadge content={content} className="shrink-0" />
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <dt className="text-xs text-muted-foreground">จำนวนตอน</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatNumber(content.chapter_count)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <dt className="text-xs text-muted-foreground">จำนวนเข้าชม</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatNumber(content.total_views)}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <GiTwoCoins className="size-3.5 text-orange-500" />
                      ยอดขาย
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatCoin(content.sales_total)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 space-y-0.5 text-sm">
                  <p>{content.primary_genre.name}</p>
                  {content.secondary_genre && (
                    <p className="text-xs text-muted-foreground">{content.secondary_genre.name}</p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p>{content.author.display_name} · {typeLabels[content.type]}</p>
                    <p className="mt-0.5">สร้างเมื่อ {formatDate(content.created_at)}</p>
                  </div>
                  {content.moderation_status !== 'locked' && (
                    <ManageContentActions contentId={content.id} onDelete={() => setContentToDelete(content)} />
                  )}
                </div>
              </article>
                ))}
              </div>
            )}
          </div>

          <Table className="hidden min-w-[1180px] md:table">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="px-3 py-2">ผลงาน</TableHead>
                <TableHead className="px-3 py-2">ผู้สร้าง</TableHead>
                <TableHead className="px-3 py-2 text-right">
                  <span className="flex items-center justify-end gap-1">
                    <GiTwoCoins className="size-4 text-orange-500" />
                    ยอดขาย
                  </span>
                </TableHead>
                <TableHead className="px-3 py-2 text-right">จำนวนตอน</TableHead>
                <TableHead className="px-3 py-2 text-right">ยอดวิว</TableHead>
                <TableHead className="px-3 py-2">ประเภท</TableHead>
                <TableHead className="px-3 py-2">หมวดหมู่</TableHead>
                <TableHead className="px-3 py-2">สถานะ</TableHead>
                <TableHead className="px-3 py-2">วันที่สร้าง</TableHead>
                <TableHead className="px-3 py-2 text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showSkeleton && <LoadingRows isVisible={isLoading} />}

              {showResolvedState && hasError && (
                <TableRow
                  className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${contentOpacity}`}
                >
                  <TableCell colSpan={10} className="h-24 text-center text-destructive">
                    ไม่สามารถโหลดผลงานได้ กรุณาลองใหม่อีกครั้ง
                  </TableCell>
                </TableRow>
              )}

              {showResolvedState && !hasError && contents.length === 0 && (
                <TableRow
                  className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${contentOpacity}`}
                >
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    ยังไม่มี{tabLabels[activeTab]}
                  </TableCell>
                </TableRow>
              )}

              {showResolvedState && !hasError && contents.map((content) => (
                <TableRow
                  key={content.id}
                  className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${contentOpacity} ${
                    content.moderation_status === 'locked' ? 'bg-destructive/10 hover:bg-destructive/15' : ''
                  }`}
                >
                  <TableCell className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/writer/content/${content.id}/content`}
                        aria-label={`${content.moderation_status === 'locked' ? 'ผลงานถูกล็อค' : 'จัดการ'} ${content.title}`}
                        aria-disabled={content.moderation_status === 'locked'}
                        tabIndex={content.moderation_status === 'locked' ? -1 : undefined}
                        className={`flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ${
                          content.moderation_status === 'locked' ? 'pointer-events-none cursor-not-allowed opacity-70' : ''
                        }`}
                      >
                        {content.cover_url ? (
                          <img
                            src={content.cover_url}
                            alt={`ปกเรื่อง ${content.title}`}
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <BookOpenIcon className="size-6 text-muted-foreground" />
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/writer/content/${content.id}/content`}
                          aria-disabled={content.moderation_status === 'locked'}
                          tabIndex={content.moderation_status === 'locked' ? -1 : undefined}
                          className={`flex items-center gap-1.5 truncate font-medium transition-colors hover:text-primary ${
                            content.moderation_status === 'locked' ? 'pointer-events-none cursor-not-allowed opacity-70' : ''
                          }`}
                        >
                          <span className="truncate">{content.title}</span>
                          <SystemSuspensionLock content={content} />
                        </Link>
                        <Link href={`/content/${encodeURIComponent(content.slug)}`} className="text-xs text-primary hover:underline">
                          /{content.slug}
                        </Link>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div>{content.author.display_name}</div>
                    <div className="text-xs text-muted-foreground">@{content.author.username}</div>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">
                    {formatCoin(content.sales_total)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(content.chapter_count)}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(content.total_views)}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={
                        content.type === StoryType.NOVEL
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-violet-200 bg-violet-50 text-violet-700'
                      }
                    >
                      {typeLabels[content.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div>{content.primary_genre.name}</div>
                    {content.secondary_genre && (
                      <div className="text-xs text-muted-foreground">{content.secondary_genre.name}</div>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <ContentStatusBadge content={content} />
                  </TableCell>
                  <TableCell className="px-3 py-2">{formatDate(content.created_at)}</TableCell>
                  <TableCell className="px-3 py-2 text-right">
                    {content.moderation_status !== 'locked' && (
                      <ManageContentActions contentId={content.id} onDelete={() => setContentToDelete(content)} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {showResolvedState && !hasError && pagination && (
            <div
              className={`flex flex-col gap-2 border-t px-3 py-2 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between ${contentOpacity}`}
            >
              <p className="text-sm text-muted-foreground">
                ทั้งหมด {new Intl.NumberFormat('th-TH').format(pagination.total)} รายการ
              </p>
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => changePage(pagination.page - 1)}
                >
                  ก่อนหน้า
                </Button>
                <span className="min-w-16 text-center text-sm text-muted-foreground">
                  {pagination.page} / {Math.max(pagination.totalPages, 1)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => changePage(pagination.page + 1)}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={contentToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setContentToDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบผลงาน</DialogTitle>
            <DialogDescription>
              ต้องการลบ “{contentToDelete?.title}” ใช่หรือไม่ ผลงานนี้จะไม่แสดงในรายการและหน้าเว็บไซต์
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setContentToDelete(null)}
            >
              ยกเลิก
            </Button>
            <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => void confirmDelete()}>
              {isDeleting ? 'กำลังลบ...' : 'ลบผลงาน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
