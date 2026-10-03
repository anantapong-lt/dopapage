'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StoryGrid, type StoryGridItem } from '@/components/story-grid'
import { getLandingStories } from '@/controllers/landing.controller'
import type {
  LandingResponse,
  LandingSection,
  LandingStory,
} from '@/interface/landing.interface'
import { formatChapterNumber } from '@/utils/chapter-number.util'
import { useAuth } from '@/components/auth/auth-provider'

function formatUpdatedAt(value: string, renderedAt: number) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((renderedAt - new Date(value).getTime()) / 1000),
  )
  if (elapsedSeconds < 60) return `${elapsedSeconds} วินาทีที่แล้ว`

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `${elapsedMinutes} นาทีที่แล้ว`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} ชั่วโมงที่แล้ว`

  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(value))
}

function toStoryGridItem(
  story: LandingStory,
  section: LandingSection,
  renderedAt: number,
): StoryGridItem {
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    episode: `ตอนที่ ${formatChapterNumber(story.latest_chapter.chapter_number)}`,
    author: story.author.display_name,
    image: story.cover_url ?? '/placeholder.svg',
    blurDataUrl: story.cover_blur_data_url,
    type: story.type,
    ratingAverage: Number(story.rating_average),
    meta: section === 'latest'
      ? `${formatUpdatedAt(story.latest_chapter.published_at, renderedAt)}`
      : section === 'most-followed'
        ? `${Number(story.favorite_count).toLocaleString('th-TH')} ติดตาม`
      : `${Number(story.total_views).toLocaleString('th-TH')} อ่าน`,
  }
}

export function StoryResultsGrid({
  initialData,
  renderedAt,
  categories,
  search,
  contentType,
  mobileInfiniteScroll = false,
}: {
  initialData: LandingResponse
  renderedAt: number
  categories?: string[]
  search?: string
  contentType?: import('@/constants/story.constant').StoryType
  mobileInfiniteScroll?: boolean
}) {
  const { accessToken } = useAuth()
  const [stories, setStories] = useState(initialData.stories)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialData.pagination.hasNextPage)
  const [skeletonCount, setSkeletonCount] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const requestVersionRef = useRef(0)
  const nextPageRef = useRef(initialData.pagination.page + 1)
  const committedPageRef = useRef(initialData.pagination.page)
  const totalPagesRef = useRef(initialData.pagination.totalPages)
  const totalItemsRef = useRef(initialData.pagination.total)
  const inFlightPagesRef = useRef(new Set<number>())
  const reservedPagesRef = useRef(new Set<number>())
  const pageResultsRef = useRef(new Map<number, LandingResponse>())

  const getReservedSkeletonCount = useCallback(() => {
    return Array.from(reservedPagesRef.current).reduce((count, page) => {
      const remainingItems = totalItemsRef.current - ((page - 1) * initialData.pagination.limit)
      return count + Math.min(initialData.pagination.limit, Math.max(0, remainingItems))
    }, 0)
  }, [initialData.pagination.limit])

  useEffect(() => {
    requestVersionRef.current += 1
    nextPageRef.current = initialData.pagination.page + 1
    committedPageRef.current = initialData.pagination.page
    totalPagesRef.current = initialData.pagination.totalPages
    totalItemsRef.current = initialData.pagination.total
    inFlightPagesRef.current.clear()
    reservedPagesRef.current.clear()
    pageResultsRef.current.clear()
    setStories(initialData.stories)
    setIsLoadingMore(false)
    setHasMore(initialData.pagination.hasNextPage)
    setSkeletonCount(0)
    setLoadError(false)
  }, [initialData])

  const loadMore = useCallback(async () => {
    const page = nextPageRef.current
    if (page > totalPagesRef.current || inFlightPagesRef.current.has(page)) return

    const requestVersion = requestVersionRef.current
    nextPageRef.current = page + 1
    inFlightPagesRef.current.add(page)
    reservedPagesRef.current.add(page)
    setIsLoadingMore(true)
    setHasMore(nextPageRef.current <= totalPagesRef.current)
    setSkeletonCount(getReservedSkeletonCount())
    setLoadError(false)

    try {
      const nextData = await getLandingStories(
        initialData.section,
        page,
        initialData.pagination.limit,
        undefined,
        categories,
        search,
        contentType,
        { accessToken },
      )
      if (requestVersion !== requestVersionRef.current) return

      totalPagesRef.current = nextData.pagination.totalPages
      totalItemsRef.current = nextData.pagination.total
      pageResultsRef.current.set(page, nextData)

      const readyStories: LandingStory[] = []
      let readyPage = committedPageRef.current + 1
      while (pageResultsRef.current.has(readyPage)) {
        const readyResult = pageResultsRef.current.get(readyPage)
        if (!readyResult) break

        readyStories.push(...readyResult.stories)
        pageResultsRef.current.delete(readyPage)
        reservedPagesRef.current.delete(readyPage)
        committedPageRef.current = readyPage
        readyPage += 1
      }

      if (readyStories.length > 0) {
        setStories((current) => {
          const existingIds = new Set(current.map((story) => story.id))
          return [
            ...current,
            ...readyStories.filter((story) => !existingIds.has(story.id)),
          ]
        })
      }

      setSkeletonCount(getReservedSkeletonCount())
      setHasMore(nextPageRef.current <= totalPagesRef.current)
    } catch {
      if (requestVersion === requestVersionRef.current) {
        nextPageRef.current = Math.min(nextPageRef.current, page)
        setHasMore(page <= totalPagesRef.current)
        setLoadError(true)
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        inFlightPagesRef.current.delete(page)
        setIsLoadingMore(inFlightPagesRef.current.size > 0)
      }
    }
  }, [accessToken, categories, contentType, getReservedSkeletonCount, initialData.pagination.limit, initialData.section, search])

  const gridStories = useMemo(
    () => stories.map((story) => toStoryGridItem(story, initialData.section, renderedAt)),
    [initialData.section, renderedAt, stories],
  )

  return (
    <>
      <StoryGrid
        eagerFirst={initialData.section === 'latest'}
        stories={gridStories}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        skeletonCount={skeletonCount}
        initialStoryCount={initialData.stories.length}
        onLoadMore={loadMore}
        mobileLayout={mobileInfiniteScroll ? 'grid' : 'carousel'}
      />
      {loadError ? (
        <p className="mt-3 text-center text-sm text-destructive">
          โหลดข้อมูลเพิ่มเติมไม่สำเร็จ กรุณาลองใหม่
        </p>
      ) : null}
    </>
  )
}
