import { decodeRouteParam } from '@/utils/route-param.util'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { LockKeyhole } from 'lucide-react'
import { notFound } from 'next/navigation'
import { ChapterReader } from '@/components/content/reader/chapter-reader'
import { getPublicChapter, getPublicContent } from '@/controllers/content.controller'
import { ApiError } from '@/lib/api-client'
import { getServerFeatureConfig } from '@/lib/server-auth'
import { formatChapterNumber } from '@/utils/chapter-number.util'
import { createContentMetadata } from '@/utils/content-metadata.util'

interface ChapterPageProps {
  params: Promise<{ slug: string; chapterNumber: string }>
}

export async function generateMetadata({ params }: ChapterPageProps): Promise<Metadata> {
  const { slug: rawSlug, chapterNumber } = await params
  const slug = decodeRouteParam(rawSlug)

  try {
    const { story, chapters } = await getPublicContent(slug)
    const chapter = chapters.chapters.find((item) => (
      Number(item.chapter_number) === Number(chapterNumber)
    ))
    const title = chapter
      ? `ตอนที่ ${formatChapterNumber(chapter.chapter_number)}: ${chapter.title} - ${story.title}`
      : story.title

    const canonical = `/content/${encodeURIComponent(slug)}/${encodeURIComponent(chapterNumber)}`
    // Reuse the story's share metadata so link previews show the cover and title instead of the site logo.
    const storyMetadata = createContentMetadata(story)

    return {
      ...storyMetadata,
      title,
      robots: { index: false, follow: true },
      alternates: { canonical },
      openGraph: { ...storyMetadata.openGraph, title, url: canonical },
      twitter: { ...storyMetadata.twitter, title },
    }
  } catch {
    return { robots: { index: false, follow: false } }
  }
}

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { slug: rawSlug, chapterNumber } = await params
  const slug = decodeRouteParam(rawSlug)

  try {
    const cookieHeader = (await cookies()).toString()
    const [data, features] = await Promise.all([
      getPublicChapter(slug, chapterNumber, cookieHeader),
      getServerFeatureConfig(),
    ])
    return <ChapterReader data={data} commentsEnabled={features?.comments === true} />
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()

    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      const needsLogin = error.status === 401
      return (
        <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-16">
          <section className="readji-surface w-full rounded-[1.75rem] p-7 text-center sm:p-10">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LockKeyhole className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-xl font-extrabold text-foreground">
              {needsLogin ? 'เข้าสู่ระบบเพื่ออ่านตอนนี้' : 'ตอนนี้ยังไม่ได้ซื้อ'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{error.message}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {needsLogin ? (
                <Link
                  href={`/login?next=${encodeURIComponent(`/content/${slug}/${chapterNumber}`)}`}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/85"
                >
                  เข้าสู่ระบบ
                </Link>
              ) : null}
              <Link
                href={`/content/${encodeURIComponent(slug)}`}
                className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-extrabold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                กลับไปหน้ารายละเอียดเรื่อง
              </Link>
            </div>
          </section>
        </div>
      )
    }

    throw error
  }
}
