'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PublicReaderChapter } from '@/interface/content.interface'

export function ChapterNavigation({
  chapters,
  currentChapterNumber,
  onNavigate,
  floating = false,
  visible = true,
}: {
  chapters: PublicReaderChapter[]
  currentChapterNumber: string
  onNavigate: (chapter: PublicReaderChapter) => void
  floating?: boolean
  visible?: boolean
}) {
  const currentIndex = chapters.findIndex((chapter) => (
    chapter.chapter_number === currentChapterNumber
  ))
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1
    ? chapters[currentIndex + 1]
    : null

  return (
    <nav
      aria-label="เปลี่ยนตอน"
      className={floating
        ? `fixed inset-x-3 bottom-3 z-50 mx-auto grid max-w-xl grid-cols-2 overflow-hidden rounded-2xl border border-border/70 shadow-xl transition-all duration-200 sm:bottom-5 ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-24 opacity-0'
        }`
        : 'grid grid-cols-2 border-t border-border/70'}
    >
      <NavigationButton
        label="ตอนก่อนหน้า"
        chapter={previousChapter}
        icon={<ChevronLeft className="size-4" aria-hidden="true" />}
        onNavigate={onNavigate}
      />
      <NavigationButton
        label={nextChapter ? 'ตอนถัดไป' : 'ตอนสุดท้ายแล้ว'}
        chapter={nextChapter}
        icon={<ChevronRight className="size-4" aria-hidden="true" />}
        iconAfter
        onNavigate={onNavigate}
      />
    </nav>
  )
}

function NavigationButton({
  label,
  chapter,
  icon,
  iconAfter = false,
  onNavigate,
}: {
  label: string
  chapter: PublicReaderChapter | null
  icon: React.ReactNode
  iconAfter?: boolean
  onNavigate: (chapter: PublicReaderChapter) => void
}) {
  if (!chapter) {
    return (
      <span className="flex h-14 cursor-not-allowed items-center justify-center gap-2 bg-muted/65 text-sm font-bold text-muted-foreground/55">
        {!iconAfter ? icon : null}{label}{iconAfter ? icon : null}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(chapter)}
      className="flex h-14 cursor-pointer items-center justify-center gap-2 bg-white text-sm font-extrabold text-primary transition-colors hover:bg-primary/10 first:bg-primary first:text-primary-foreground first:hover:bg-primary/85"
    >
      {!iconAfter ? icon : null}{label}{iconAfter ? icon : null}
    </button>
  )
}
