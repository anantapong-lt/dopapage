'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getLandingStories } from '@/controllers/landing.controller'
import type { LandingSection, LandingStory } from '@/interface/landing.interface'
import { useAuth } from '@/components/auth/auth-provider'

interface PopularRankingSectionProps {
  section: Extract<LandingSection, 'weekly' | 'all-time'>
  headingId: string
  heading: string
  description: string
}

function formatViews(value: string) {
  return `${Number(value).toLocaleString('th-TH')} อ่าน`
}

export function PopularRankingSection({
  section,
  headingId,
  heading,
  description,
}: PopularRankingSectionProps) {
  const { accessToken } = useAuth()
  const [stories, setStories] = useState<LandingStory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)')
    const updateViewport = () => setIsDesktop(mediaQuery.matches)

    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)

    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  useEffect(() => {
    if (!isDesktop) return

    const abortController = new AbortController()

    async function loadRanking() {
      setIsLoading(true)
      setHasError(false)

      try {
        const data = await getLandingStories(section, 1, 5, abortController.signal, undefined, undefined, undefined, { accessToken })
        setStories(data.stories)
      } catch {
        if (!abortController.signal.aborted) setHasError(true)
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false)
      }
    }

    void loadRanking()
    return () => abortController.abort()
  }, [accessToken, isDesktop, section])

  return (
    <aside aria-labelledby={headingId} className="w-full">
      <div className="rounded-md bg-card p-4">
        <h2 id={headingId} className="text-lg font-bold tracking-tight text-foreground">
          {heading}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>

        {isLoading ? (
          <ol className="mt-4 space-y-3.5" aria-label="กำลังโหลดอันดับ">
            {Array.from({ length: 5 }, (_, index) => (
              <li
                key={index}
                className="grid animate-pulse grid-cols-[1.5rem_2.25rem_minmax(0,1fr)] items-center gap-2"
              >
                <span className="size-6 rounded-full bg-muted" />
                <span className="aspect-[3/4] rounded-sm bg-muted" />
                <span className="space-y-1.5">
                  <span className="block h-3 rounded bg-muted" />
                  <span className="block h-2.5 w-2/3 rounded bg-muted" />
                  <span className="block h-2.5 w-1/2 rounded bg-muted" />
                </span>
              </li>
            ))}
          </ol>
        ) : hasError ? (
          <p className="mt-4 text-xs text-destructive">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
        ) : stories.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">ยังไม่มีข้อมูลอันดับ</p>
        ) : (
          <ol className="mt-4 space-y-3.5">
            {stories.map((story, index) => (
              <li key={story.id}>
                <Link
                  href={`/content/${encodeURIComponent(story.slug)}`}
                  className="group grid grid-cols-[1.5rem_2.25rem_minmax(0,1fr)] items-center gap-2"
                >
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs font-black tabular-nums transition-colors ${
                      index === 0
                        ? 'bg-primary text-white shadow-sm'
                        : index < 3
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground group-hover:text-primary'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-muted">
                    <Image
                      src={story.cover_url ?? '/placeholder.svg'}
                      alt={`ปกเรื่อง ${story.title}`}
                      fill
                      sizes="36px"
                      quality={60}
                      loading="lazy"
                      className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-bold text-foreground transition-colors group-hover:text-primary">
                      {story.title}
                    </h3>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {story.author.display_name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatViews(story.ranking_views)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  )
}
