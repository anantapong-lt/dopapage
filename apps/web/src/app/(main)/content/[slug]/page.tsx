import { decodeRouteParam } from '@/utils/route-param.util'
import type { Metadata } from 'next'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { BookOpenText, ChevronDown, Clock3, Eye, UserRound } from 'lucide-react'
import { ShareButtons } from '@/components/common/share-buttons'
import { PublicChapterList } from '@/components/content/public-chapter-list'
import { FavoriteButton } from '@/components/content/favorite-button'
import { StoryRating } from '@/components/content/story-rating'
import { getPublicContent } from '@/controllers/content.controller'
import { ApiError } from '@/lib/api-client'
import {
  createContentMetadata,
  createContentStructuredData,
} from '@/utils/content-metadata.util'
import { formatChapterNumber } from '@/utils/chapter-number.util'

interface ContentPageProps {
  params: Promise<{ slug: string }>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCompactCount(value: string) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value))
}

export async function generateMetadata({ params }: ContentPageProps): Promise<Metadata> {
  const slug = decodeRouteParam((await params).slug)

  try {
    const { story } = await getPublicContent(slug)
    return createContentMetadata(story)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        title: 'ไม่พบเรื่อง',
        robots: { index: false, follow: false },
      }
    }

    throw error
  }
}

export default async function ContentPage({ params }: ContentPageProps) {
  const slug = decodeRouteParam((await params).slug)

  try {
    const cookieHeader = (await cookies()).toString()
    const { story, chapters: initialChapters } = await getPublicContent(slug, cookieHeader)
    const structuredData = createContentStructuredData(story, initialChapters.chapters)
    const ageRatingLabel = story.age_rating === null || story.age_rating === 0
      ? 'ทั่วไป'
      : `${story.age_rating}+`

    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-8 md:py-7 lg:py-9">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />
        <article className="readji-surface relative isolate overflow-hidden rounded-3xl border border-border/70">
          {story.cover_url ? (
            <>
              <Image
                src={story.cover_blur_data_url ?? story.cover_url}
                alt=""
                fill
                sizes="100vw"
                quality={40}
                className={`object-cover opacity-20 ${story.cover_blur_data_url ? '' : 'blur-sm'}`}
              />
              <div aria-hidden="true" className="absolute inset-0 bg-background/65" />
            </>
          ) : null}
          <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:p-9">
            <div className="mx-auto w-full max-w-[13rem] lg:mx-0">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted shadow-lg ring-1 ring-border/60">
                {story.cover_url ? (
                  <Image
                    src={story.cover_url}
                    alt={`ปกเรื่อง ${story.title}`}
                    fill
                    sizes="208px"
                    quality={85}
                    preload
                    fetchPriority="high"
                    placeholder={story.cover_blur_data_url ? 'blur' : 'empty'}
                    blurDataURL={story.cover_blur_data_url ?? undefined}
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                    <BookOpenText className="size-10 opacity-50" aria-hidden="true" />
                    <span className="text-sm">ยังไม่มีภาพปก</span>
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <h1 className="readji-page-title line-clamp-2 text-center text-2xl leading-[1.25] sm:text-3xl lg:text-left lg:text-3xl">
                {story.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{story.primary_genre.name}</span>
                {story.secondary_genre ? (
                  <>
                    <span aria-hidden="true">•</span>
                    <span>{story.secondary_genre.name}</span>
                  </>
                ) : null}
                <span aria-hidden="true">•</span>
                <span>เรต {ageRatingLabel}</span>
                <span aria-hidden="true">•</span>
                <span className="flex items-center gap-1 font-medium tabular-nums text-foreground">
                  <Eye className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">ยอดอ่าน</span>
                  {formatCompactCount(story.total_views)}
                </span>
              </div>

              <div className="mt-3 flex w-fit items-center gap-2.5 py-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground ring-1 ring-border/60">
                  <UserRound className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">เขียนโดย</p>
                  <p className="font-bold text-foreground">
                    {story.author.display_name}
                  </p>
                </div>
              </div>

              {story.latest_chapter ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5 text-primary" aria-hidden="true" />
                  อัปเดตล่าสุด {formatDate(story.latest_chapter.published_at)}
                  <span aria-hidden="true">·</span>
                  ตอนที่ {formatChapterNumber(story.latest_chapter.chapter_number)}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <FavoriteButton
                  slug={story.slug}
                  initialCount={Number(story.favorite_count)}
                  initialIsFavorited={story.is_favorited}
                />
                <ShareButtons title={story.title} />
                <StoryRating
                  slug={story.slug}
                  initialAverage={Number(story.rating_average)}
                  initialCount={Number(story.rating_count)}
                  initialUserRating={story.user_rating}
                />
              </div>

              <section className="mt-6 border-t border-border/70 pt-5">
                <details className="group overflow-hidden rounded-xl border border-border/70 bg-background/70">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-base font-extrabold text-foreground marker:content-none">
                    <span>เรื่องย่อ</span>
                    <ChevronDown
                      className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="border-t border-border/70 px-4 py-3">
                    <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                      {story.synopsis || 'ยังไม่มีเรื่องย่อ'}
                    </p>
                  </div>
                </details>
              </section>

            </div>
          </div>
        </article>
        <PublicChapterList
          slug={story.slug}
          storyTitle={story.title}
          coverUrl={story.cover_url}
          initialData={initialChapters}
          renderedAt={Date.now()}
        />
      </div>
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }
}
