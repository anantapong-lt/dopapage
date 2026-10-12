'use client'

import { useEffect, useRef, useState, type CSSProperties, type UIEventHandler } from 'react'
import { StoryCard, type StoryCardProps } from '@/components/common/story-card'
import { StoryCardSkeleton } from '@/components/common/story-card-skeleton'

export interface StoryGridItem extends Omit<StoryCardProps, 'eager'> {
  id: string | number
}

export function StoryGrid({
  stories,
  eagerFirst = false,
  hasMore = false,
  isLoadingMore = false,
  skeletonCount = 0,
  initialStoryCount = stories.length,
  onLoadMore,
  mobileLayout = 'carousel',
}: {
  stories: StoryGridItem[]
  eagerFirst?: boolean
  hasMore?: boolean
  isLoadingMore?: boolean
  skeletonCount?: number
  initialStoryCount?: number
  onLoadMore?: () => Promise<void>
  mobileLayout?: 'carousel' | 'grid'
}) {
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const resultGridRef = useRef<HTMLDivElement>(null)
  const [resultGridColumns, setResultGridColumns] = useState(6)
  const items: Array<StoryGridItem | null> = [
    ...stories,
    ...Array.from({ length: skeletonCount }, () => null),
  ]
  const pages = Array.from(
    { length: Math.ceil(items.length / 6) },
    (_, index) => items.slice(index * 6, index * 6 + 6),
  )
  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    if (!hasMore || !onLoadMore) return

    const container = event.currentTarget
    const remainingScroll = container.scrollWidth - container.scrollLeft - container.clientWidth
    if (remainingScroll <= Math.max(48, container.clientWidth * 0.5)) void onLoadMore()
  }
  const handleLoadMoreClick = async () => {
    if (hasMore && onLoadMore) await onLoadMore()
  }

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !hasMore || !onLoadMore) return

    const shouldObserve = mobileLayout === 'grid'
      ? window.matchMedia('(max-width: 1023px)').matches
      : window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches
    if (!shouldObserve) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void onLoadMore()
      },
      { rootMargin: '200px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, mobileLayout, onLoadMore])

  useEffect(() => {
    const grid = resultGridRef.current
    if (mobileLayout !== 'grid' || !grid) return

    const updateColumns = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setResultGridColumns(3)
        return
      }

      const maximumColumns = Math.max(1, Math.floor((grid.clientWidth + 16) / 176))
      setResultGridColumns(maximumColumns)
    }

    updateColumns()
    const observer = new ResizeObserver(updateColumns)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [mobileLayout])

  const resultGridColumnsClass = stories.length === 1
    ? 'lg:[grid-template-columns:minmax(10rem,11rem)]'
    : 'lg:[grid-template-columns:repeat(var(--result-grid-columns),minmax(10rem,1fr))]'

  return (
    <>
      <div
        ref={mobileLayout === 'grid' ? resultGridRef : undefined}
        onScroll={mobileLayout === 'carousel' ? handleScroll : undefined}
        className={mobileLayout === 'grid'
          ? `mx-auto grid grid-cols-3 gap-x-2 gap-y-5 pb-2 lg:max-w-7xl lg:gap-x-4 lg:gap-y-7 lg:pb-0 ${resultGridColumnsClass}`
          : 'mx-auto flex snap-x snap-proximity scroll-smooth gap-2 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-4 md:gap-x-4 md:gap-y-7 md:overflow-visible md:pb-0 lg:grid-cols-6 xl:max-w-7xl xl:grid-cols-4 2xl:grid-cols-6'}
        style={mobileLayout === 'grid' && stories.length !== 1
          ? { '--result-grid-columns': resultGridColumns } as CSSProperties
          : undefined}
      >
        {pages.map((page, pageIndex) => (
          <div
            key={pageIndex}
            className={mobileLayout === 'grid' ? 'contents' : `grid w-[calc(120%_-_0.2rem)] shrink-0 snap-start grid-cols-3 gap-x-2 gap-y-5 md:contents ${
              page.length > 3 ? 'grid-rows-2' : 'grid-rows-1'
            }`}
          >
            {page.map((item, itemIndex) => {
              const storyIndex = pageIndex * 6 + itemIndex

              if (!item) {
                return (
                  <div key={`skeleton-${storyIndex}`} className="min-w-0">
                    <StoryCardSkeleton />
                  </div>
                )
              }

              const { id, ...story } = item

              return (
                <div
                  key={id}
                  className={`min-w-0 ${
                    storyIndex >= initialStoryCount
                      ? 'animate-in fade-in-0 duration-300 motion-reduce:animate-none'
                      : ''
                  }`}
                >
                  <StoryCard {...story} eager={eagerFirst && storyIndex < 6} />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {hasMore ? (
        <div
          ref={loadMoreSentinelRef}
          className={mobileLayout === 'grid' ? 'h-px lg:hidden' : 'hidden h-px md:block xl:hidden'}
        />
      ) : null}

      {hasMore ? (
        <button
          type="button"
          onClick={() => void handleLoadMoreClick()}
          className={`mx-auto mt-8 hidden cursor-pointer rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 ${
            mobileLayout === 'grid' ? 'lg:block' : 'md:block'
          }`}
        >
          {isLoadingMore ? 'กำลังโหลด...' : 'แสดงเพิ่มเติม'}
        </button>
      ) : null}
    </>
  )
}
