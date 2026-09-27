'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StoryType } from '@/constants/story.constant'
import { getWriterContent } from '@/controllers/writer.controller'
import type { WriterContentDetail, WriterContentTab } from '@/interface/writer-content.interface'
import { CoverImageUpload } from '../create/components/cover-image-upload'
import { CreateStoryForm } from '../create/components/create-story-form'
import { SlugField } from '../create/components/slug-field'
import { StoryGenreFields } from '../create/components/story-genre-fields'
import { StoryMetadataFields } from '../create/components/story-metadata-fields'
import { SynopsisField } from '../create/components/synopsis-field'

interface ContentEditorProps {
  contentId?: string
  embedded?: boolean
  initialContentType?: WriterContentTab
  initialTitle?: string
  initialAlternativeTitle?: string
}

export function ContentEditor({
  contentId,
  embedded = false,
  initialContentType = 'novel',
  initialTitle = '',
  initialAlternativeTitle = '',
}: ContentEditorProps) {
  const { accessToken, status } = useAuth()
  const [story, setStory] = useState<WriterContentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(contentId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const Root = embedded ? 'div' : 'main'
  const rootClassName = embedded ? 'mt-6' : 'min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 '
  const containerClassName = embedded ? '' : 'mx-auto max-w-7xl'

  useEffect(() => {
    if (!contentId) return
    if (!accessToken) {
      if (status === 'unauthenticated') {
        setIsLoading(false)
        setLoadError('ไม่พบข้อมูลการเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง')
      }
      return
    }

    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    void getWriterContent(contentId, accessToken)
      .then(({ story: nextStory }) => {
        if (!cancelled) setStory(nextStory)
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'ไม่สามารถโหลดเนื้อหาได้')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, contentId, status])

  if (isLoading) {
    return (
      <Root className={rootClassName}>
        <div className={containerClassName}>
          <div className="flex items-center justify-between gap-4">
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <Link href="/writer/contents">
                <ArrowLeft />
                ย้อนกลับ
              </Link>
            </Button>
            <div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)] lg:items-start">
            <section className="readji-surface grid gap-5 rounded-2xl p-5 md:grid-cols-2 md:p-6">
              <div className="space-y-2 md:col-span-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-36 w-full rounded-xl" />
              </div>
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              ))}
            </section>

            <aside className="readji-surface rounded-2xl p-5 md:p-6">
              <Skeleton className="mb-3 h-4 w-16" />
              <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
            </aside>

            <div className="flex justify-end gap-3 border-t border-border pt-5 lg:col-span-2">
              <Skeleton className="h-11 w-24 rounded-xl" />
              <Skeleton className="h-11 w-28 rounded-xl" />
            </div>
          </div>
        </div>
      </Root>
    )
  }

  if (contentId && (loadError || !story)) {
    return (
      <Root className={rootClassName}>
        <div className="readji-surface mx-auto max-w-7xl rounded-2xl p-8 text-center">
          <p className="text-sm text-destructive">{loadError ?? 'ไม่พบเนื้อหาที่ต้องการแก้ไข'}</p>
          <Button asChild variant="outline" className="mt-4 h-11 rounded-xl">
            <Link href="/writer/contents">
              <ArrowLeft />
              ย้อนกลับ
            </Link>
          </Button>
        </div>
      </Root>
    )
  }

  const contentType: WriterContentTab = story?.type === StoryType.MANGA ? 'cartoon' : initialContentType
  const isCartoon = contentType === 'cartoon'
  const contentLabel = isCartoon ? 'การ์ตูน' : 'นิยาย'
  const databaseType = isCartoon ? StoryType.MANGA : StoryType.NOVEL
  const cancelHref = `/writer/contents/?tab=${contentType}`
  const renderFormContent = (actions?: ReactNode) => (
    <>
      <input type="hidden" name="type" value={databaseType} />

      <section className="readji-surface grid gap-5 rounded-2xl p-5 md:grid-cols-2 md:p-6">
        <StoryMetadataFields
          initialTitle={story?.title ?? initialTitle}
          initialAlternativeTitle={story?.alternative_title ?? initialAlternativeTitle}
          initialStatus={story?.status}
          initialAgeRating={story?.age_rating?.toString() ?? ''}
        >
          <SlugField initialSlug={story?.slug} allowAutoGenerate={!contentId} />
          <SynopsisField contentLabel={contentLabel} initialSynopsis={story?.synopsis ?? ''} />
        </StoryMetadataFields>

        <StoryGenreFields
          initialPrimaryGenreId={story?.primary_genre_id}
          initialSecondaryGenreId={story?.secondary_genre_id ?? ''}
        />
      </section>

      <aside className="readji-surface rounded-2xl p-5 md:p-6">
        <CoverImageUpload initialCoverUrl={story?.cover_url} />
        {actions}
      </aside>
    </>
  )

  return (
    <Root className={rootClassName}>
      <div className={containerClassName}>
        <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
          <div>
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <Link href={cancelHref}>
                <ArrowLeft />
                ย้อนกลับ
              </Link>
            </Button>
            {!contentId && (
              <h1 className="mt-3 text-2xl font-bold tracking-[-0.025em] md:text-3xl">สร้าง{contentLabel}ใหม่</h1>
            )}
          </div>

          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
            {contentLabel}
          </span>
        </div>

        <CreateStoryForm cancelHref={cancelHref} contentId={contentId}>
          {contentId ? ({ actions }) => renderFormContent(actions) : renderFormContent()}
        </CreateStoryForm>
      </div>
    </Root>
  )
}
