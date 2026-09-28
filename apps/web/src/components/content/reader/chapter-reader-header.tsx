'use client'

import { AudioLines, BookOpen, Home } from 'lucide-react'
import Link from 'next/link'
import { ShareButtons } from '@/components/common/share-buttons'
import { Button } from '@/components/ui/button'
import type { PublicReaderChapter } from '@/interface/content.interface'
import { READING_THEMES, type ReadingSettings } from '@/lib/reading-settings'
import { formatChapterNumber } from '@/utils/chapter-number.util'
import { ChapterTocDialog } from './chapter-toc-dialog'
import { ReadingSettingsMenu } from './reading-settings-menu'

export function ChapterReaderHeader({
  slug,
  storyTitle,
  chapterNumber,
  chapterTitle,
  chapters,
  showReadingSettings,
  hasAudio,
  showingAudioPlayer,
  settings,
  navbarVisible,
  onSettingsChange,
  onAudioPlayerToggle,
  onNavigate,
}: {
  slug: string
  storyTitle: string
  chapterNumber: string
  chapterTitle: string
  chapters: PublicReaderChapter[]
  showReadingSettings: boolean
  hasAudio: boolean
  showingAudioPlayer: boolean
  settings: ReadingSettings
  navbarVisible: boolean
  onSettingsChange: (settings: ReadingSettings) => void
  onAudioPlayerToggle: () => void
  onNavigate: (chapter: PublicReaderChapter) => void
}) {
  const theme = READING_THEMES[settings.theme]

  return (
    <header
      className={`sticky z-40 flex items-center justify-between gap-3 border-b border-border/70 px-3 py-3 shadow-sm transition-[top,background-color,color] duration-200 sm:px-6 sm:py-4 ${
        navbarVisible ? 'top-[4.35rem]' : 'top-0'
      }`}
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={`/content/${encodeURIComponent(slug)}`}
          aria-label="กลับหน้ารายละเอียดเรื่อง"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/85"
        >
          <Home className="size-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <Link
            href={`/content/${encodeURIComponent(slug)}`}
            className="block truncate text-xs font-bold transition-opacity hover:opacity-70"
            style={{ color: theme.text }}
          >
            {storyTitle}
          </Link>
          <p className="text-xs font-semibold" style={{ color: theme.text, opacity: 0.7 }}>
            ตอนที่ {formatChapterNumber(chapterNumber)}
          </p>
          <h1 className="truncate text-sm font-extrabold sm:text-lg" style={{ color: theme.text }}>
            {chapterTitle}
          </h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ChapterTocDialog
          chapters={chapters}
          currentChapterNumber={chapterNumber}
          onNavigate={onNavigate}
          triggerClassName="!text-current"
        />
        {showReadingSettings ? (
          <ReadingSettingsMenu
            settings={settings}
            onChange={onSettingsChange}
            triggerClassName="!text-current"
          />
        ) : null}
        {hasAudio ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={showingAudioPlayer ? 'กลับไปอ่านเนื้อหา' : 'ฟังเสียงตอนนี้'}
            aria-pressed={showingAudioPlayer}
            title={showingAudioPlayer ? 'กลับไปอ่านเนื้อหา' : 'ฟังเสียงตอนนี้'}
            className="!text-current"
            onClick={onAudioPlayerToggle}
          >
            {showingAudioPlayer ? <BookOpen aria-hidden="true" /> : <AudioLines aria-hidden="true" />}
          </Button>
        ) : null}
        <ShareButtons title={chapterTitle} iconOnly className="!text-current" />
      </div>
    </header>
  )
}
