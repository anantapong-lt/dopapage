'use client'

import { AudioLines, Home, Pause, Play, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { type RefObject, useEffect, useState } from 'react'
import { ShareButtons } from '@/components/common/share-buttons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PublicReaderChapter } from '@/interface/content.interface'
import { READING_THEMES, type ReadingSettings } from '@/lib/reading-settings'
import { ChapterTocDialog } from './chapter-toc-dialog'
import { ReadingSettingsMenu } from './reading-settings-menu'

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

export function ChapterReaderHeader({
  slug,
  storyTitle,
  chapterNumber,
  chapterTitle,
  chapters,
  showReadingSettings,
  hasAudio,
  audioUrl,
  settings,
  navbarVisible,
  onSettingsChange,
  onAudioTimeChange,
  onAudioPlayingChange,
  audioRef,
  onNavigate,
  onAutoReadEnded,
}: {
  slug: string
  storyTitle: string
  chapterNumber: string
  chapterTitle: string
  chapters: PublicReaderChapter[]
  showReadingSettings: boolean
  hasAudio: boolean
  audioUrl: string | null
  settings: ReadingSettings
  navbarVisible: boolean
  onSettingsChange: (settings: ReadingSettings) => void
  onAudioTimeChange: (time: number) => void
  onAudioPlayingChange: (isPlaying: boolean) => void
  audioRef: RefObject<HTMLAudioElement | null>
  onNavigate: (chapter: PublicReaderChapter) => void
  onAutoReadEnded: () => Promise<void>
}) {
  const theme = READING_THEMES[settings.theme]
  const [autoReadOpen, setAutoReadOpen] = useState(false)
  const [duration, setDuration] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isModalPlaying, setIsModalPlaying] = useState(false)

  useEffect(() => {
    if (!isModalPlaying) return
    let frameId = 0
    const updateProgress = () => {
      const audio = audioRef.current
      if (audio) {
        setStartTime(audio.currentTime)
        onAudioTimeChange(audio.currentTime)
        onAudioPlayingChange(!audio.paused)
      }
      frameId = window.requestAnimationFrame(updateProgress)
    }
    frameId = window.requestAnimationFrame(updateProgress)
    return () => window.cancelAnimationFrame(frameId)
  }, [isModalPlaying, onAudioPlayingChange, onAudioTimeChange])

  function toggleModalPlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.currentTime = startTime
      audio.play().catch(() => setIsModalPlaying(false))
    } else {
      audio.pause()
    }
  }

  return (
    <header
      className={`sticky z-40 flex items-center justify-between gap-3 border-b border-border/70 px-3 py-3 shadow-sm transition-[top,background-color,color] duration-200 sm:px-6 sm:py-4 ${
        navbarVisible ? 'top-[4.35rem]' : 'top-0'
      }`}
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onPlay={() => {
          setIsModalPlaying(true)
          onAudioPlayingChange(true)
        }}
        onPause={() => {
          setIsModalPlaying(false)
          onAudioPlayingChange(false)
        }}
        onEnded={() => {
          setIsModalPlaying(false)
          onAudioPlayingChange(false)
          void onAutoReadEnded()
        }}
        onTimeUpdate={(event) => {
          const currentTime = event.currentTarget.currentTime
          setStartTime(currentTime)
          onAudioTimeChange(currentTime)
        }}
      />
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
          <h1 className="truncate text-sm font-extrabold sm:text-lg" style={{ color: theme.text }}>
            {chapterTitle}
          </h1>
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-1.5">
        <div className="flex min-w-9 flex-col items-center gap-0.5">
          <ChapterTocDialog
            chapters={chapters}
            currentChapterNumber={chapterNumber}
            onNavigate={onNavigate}
            triggerClassName="!text-current"
          />
          <span className="whitespace-nowrap text-[10px] font-medium leading-none">สารบัญ</span>
        </div>
        {showReadingSettings ? (
          <div className="flex min-w-9 flex-col items-center gap-0.5">
            <ReadingSettingsMenu
              settings={settings}
              onChange={onSettingsChange}
              triggerClassName="!text-current"
            />
            <span className="whitespace-nowrap text-[10px] font-medium leading-none">ตั้งค่าอ่าน</span>
          </div>
        ) : null}
        {hasAudio ? (
          <div className="flex min-w-9 flex-col items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="เปิดการอ่านอัตโนมัติ"
              aria-pressed={autoReadOpen}
              title="อ่านอัตโนมัติ"
              className="!text-current"
              onClick={() => setAutoReadOpen(true)}
            >
              <AudioLines aria-hidden="true" />
            </Button>
            <Dialog open={autoReadOpen} onOpenChange={setAutoReadOpen}>
              <DialogContent className="!max-w-[calc(100%-3rem)] gap-5 rounded-[1.75rem] p-5 sm:!max-w-2xl sm:p-6" overlayClassName="bg-black/25 backdrop-blur-sm">
                <DialogHeader className="gap-1.5 pr-8">
                  <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
                    <AudioLines className="size-5 text-primary" aria-hidden="true" />
                    อ่านอัตโนมัติ
                  </DialogTitle>
                  <DialogDescription>เลือกเสียงบรรยายและเริ่มอ่านตอนนี้</DialogDescription>
                </DialogHeader>

                <section>
                  <p className="mb-2 text-sm font-bold">เลือกเสียงบรรยาย</p>
                  <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
                    <p className="font-bold text-primary">เสียงบรรยายของตอนนี้</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">พร้อมฟัง</p>
                  </div>
                </section>

                <section className="rounded-[1.5rem] border bg-muted/30 p-4">
                  <div className="mb-3 flex justify-between text-xs font-semibold tabular-nums text-muted-foreground">
                    <span>{formatAudioTime(startTime)}</span>
                    <span>{formatAudioTime(duration)}</span>
                  </div>
                  <input
                    aria-label="ตำแหน่งเริ่มอ่าน"
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={Math.min(startTime, duration || 0)}
                    disabled={!duration}
                    className="h-1 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
                    onChange={(event) => {
                      const nextTime = Number(event.target.value)
                      setStartTime(nextTime)
                      if (audioRef.current) audioRef.current.currentTime = nextTime
                    }}
                  />
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <Button type="button" variant="ghost" size="icon" aria-label="เริ่มจากต้นตอน" onClick={() => {
                      setStartTime(0)
                      if (audioRef.current) audioRef.current.currentTime = 0
                    }}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon" className="size-10 rounded-full shadow-sm" aria-label={isModalPlaying ? 'หยุดอ่านชั่วคราว' : 'เริ่มอ่านอัตโนมัติ'} onClick={toggleModalPlayback}>
                      {isModalPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
                    </Button>
                    <div className="inline-flex rounded-xl border bg-background p-0.5" role="group" aria-label="ความเร็วการอ่าน">
                      {[0.8, 1, 1.2].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          aria-pressed={playbackRate === rate}
                          onClick={() => {
                            setPlaybackRate(rate)
                            if (audioRef.current) audioRef.current.playbackRate = rate
                          }}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${playbackRate === rate ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          {rate}×
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="divide-y rounded-2xl border bg-white px-3">
                  <button type="button" className="flex w-full items-center justify-between py-3 text-left" onClick={() => onSettingsChange({ ...settings, autoNext: !settings.autoNext })}>
                    <span><span className="block text-sm font-bold">ตอนต่อไปอัตโนมัติ</span><span className="block text-xs text-muted-foreground">เมื่อฟังจบ ระบบจะไปตอนถัดไป</span></span>
                    <span role="switch" aria-checked={settings.autoNext} className={`relative h-6 w-10 rounded-full border transition-colors ${settings.autoNext ? 'border-primary bg-primary' : 'border-neutral-300 bg-neutral-200'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-md transition-transform ${settings.autoNext ? 'translate-x-5' : 'translate-x-1'}`} /></span>
                  </button>
                  <button type="button" className="flex w-full items-center justify-between py-3 text-left" onClick={() => onSettingsChange({ ...settings, autoPurchase: !settings.autoPurchase })}>
                    <span><span className="block text-sm font-bold">ซื้อตอนอัตโนมัติ</span><span className="block text-xs text-muted-foreground">ซื้อและปลดล็อกตอนถัดไปเมื่อจำเป็น</span></span>
                    <span role="switch" aria-checked={settings.autoPurchase} className={`relative h-6 w-10 rounded-full border transition-colors ${settings.autoPurchase ? 'border-primary bg-primary' : 'border-neutral-300 bg-neutral-200'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-md transition-transform ${settings.autoPurchase ? 'translate-x-5' : 'translate-x-1'}`} /></span>
                  </button>
                </section>

                <Button
                  type="button"
                  className="h-12 w-full rounded-xl text-base font-bold"
                  onClick={toggleModalPlayback}
                >
                  <Play className="size-5" aria-hidden="true" />
                  {isModalPlaying ? 'หยุดอ่านชั่วคราว' : 'เริ่มอ่านอัตโนมัติ'}
                </Button>
              </DialogContent>
            </Dialog>
            <span className="whitespace-nowrap text-[10px] font-medium leading-none">อ่านอัตโนมัติ</span>
          </div>
        ) : null}
        <div className="flex min-w-9 flex-col items-center gap-0.5">
          <ShareButtons title={chapterTitle} iconOnly className="!text-current" />
          <span className="whitespace-nowrap text-[10px] font-medium leading-none">แชร์</span>
        </div>
        {isModalPlaying && !autoReadOpen ? (
          <Button
            type="button"
            size="icon"
            aria-label="หยุดอ่านชั่วคราว"
            title="หยุดอ่านชั่วคราว"
            className="size-10 self-start rounded-full shadow-md"
            onClick={toggleModalPlayback}
          >
            <Pause className="size-5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </header>
  )
}
