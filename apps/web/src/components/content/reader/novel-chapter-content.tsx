'use client'

import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReadingSettings } from '@/lib/reading-settings'
import { READING_FONTS, READING_THEMES } from '@/lib/reading-settings'
import { ReaderContentSkeleton } from './reader-content-skeleton'
import { useReaderContentProtection } from './use-reader-content-protection'

type AudioTimelineEntry = {
  text: string
  start_seconds: number
  end_seconds: number
}

const BLOCKED_ELEMENTS =
  'script,style,iframe,object,embed,form,input,button,textarea,select,meta,link,base,svg,math,audio,video,source,canvas'
const SAFE_ATTRIBUTES = new Set(['data-type', 'dir', 'start', 'style'])
const SAFE_IMAGE_ATTRIBUTES = new Set(['src', 'alt', 'data-image-display-width', 'data-image-align'])
const SAFE_STYLE_PROPERTIES = new Set([
  'display',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'min-height',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'text-indent',
])

function isSafeStyleValue(value: string) {
  return (
    value.length <= 200 &&
    !/(?:@import|behavior|expression|javascript|[-]moz-binding|url)\s*\(/i.test(value) &&
    !/[<>\u0000]/.test(value)
  )
}

function isSafeChapterImageSource(value: string) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value)
  if (!match) return false
  const encoded = match[1].replace(/\s/g, '')
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return encoded.length > 0 && Math.floor((encoded.length * 3) / 4) - padding <= 5 * 1024 * 1024
}

function normalizeSpokenText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function addReadAlongMetadata(document: Document, timeline: AudioTimelineEntry[]) {
  const paragraphs = Array.from(document.body.querySelectorAll<HTMLElement>(
    'p, span[data-type="paragraph"], h1, h2, h3, h4, h5, h6, li, blockquote, pre',
  ))
    .filter((paragraph) => Boolean(normalizeSpokenText(paragraph.textContent ?? '')))
  if (!paragraphs.length || !timeline.length) return

  const boundaries = timeline.filter((entry) => (
    typeof entry.text === 'string'
    && Number.isFinite(entry.start_seconds)
    && Number.isFinite(entry.end_seconds)
    && entry.end_seconds > entry.start_seconds
  )).reduce<Array<{ start: number; end: number; entry: AudioTimelineEntry }>>((result, entry) => {
    const start = result.at(-1)?.end ?? 0
    result.push({ start, end: start + normalizeSpokenText(entry.text).length, entry })
    return result
  }, [])
  if (!boundaries.length) return

  let characterOffset = 0
  for (const paragraph of paragraphs) {
    const length = normalizeSpokenText(paragraph.textContent ?? '').length
    const paragraphStart = characterOffset
    const paragraphEnd = paragraphStart + length
    characterOffset = paragraphEnd + 1
    const first = boundaries.find((boundary) => boundary.end > paragraphStart)
    const last = [...boundaries].reverse().find((boundary) => boundary.start < paragraphEnd)
    if (!first || !last) continue

    const timeAt = (position: number, boundary: typeof first) => {
      const span = Math.max(1, boundary.end - boundary.start)
      const ratio = Math.max(0, Math.min(1, (position - boundary.start) / span))
      return boundary.entry.start_seconds + (boundary.entry.end_seconds - boundary.entry.start_seconds) * ratio
    }
    paragraph.dataset.readAlongStart = String(timeAt(paragraphStart, first))
    paragraph.dataset.readAlongEnd = String(timeAt(paragraphEnd, last))
  }
}

function sanitizeChapterHtml(html: string, timeline: AudioTimelineEntry[]) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('a').forEach((element) => element.replaceWith(...element.childNodes))
  document.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove())

  let imageCount = 0
  document.body.querySelectorAll('*').forEach((element) => {
    if (element.tagName === 'IMG') {
      imageCount += 1
      if (imageCount > 4 || !isSafeChapterImageSource(element.getAttribute('src') ?? '')) {
        element.remove()
        return
      }
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const allowedAttributes = element.tagName === 'IMG' ? SAFE_IMAGE_ATTRIBUTES : SAFE_ATTRIBUTES

      if (!allowedAttributes.has(name)) {
        element.removeAttribute(attribute.name)
        continue
      }
    }

    if (element.tagName === 'IMG') {
      element.setAttribute('loading', 'lazy')
      element.setAttribute('decoding', 'async')
      element.setAttribute('draggable', 'false')
    }

    const style = (element as HTMLElement).style
    for (const property of [...style]) {
      if (!SAFE_STYLE_PROPERTIES.has(property) || !isSafeStyleValue(style.getPropertyValue(property).trim())) {
        style.removeProperty(property)
      }
    }

    if (element.matches('span[data-type="paragraph"]')) {
      style.display = 'block'
      if (!style.minHeight) style.minHeight = '1lh'
    }

    if (element.tagName === 'IMG') {
      const parsedWidth = Number(element.getAttribute('data-image-display-width'))
      const align = element.getAttribute('data-image-align')
      style.display = 'block'
      style.width =
        Number.isInteger(parsedWidth) && parsedWidth >= 48 && parsedWidth <= 5000 ? `${parsedWidth}px` : 'auto'
      style.maxWidth = '100%'
      style.height = 'auto'
      style.marginLeft = align === 'left' ? '0' : 'auto'
      style.marginRight = align === 'right' ? '0' : 'auto'
    }
  })

  const paragraphSelector = 'p, span[data-type="paragraph"]'
  for (const paragraph of Array.from(document.body.querySelectorAll<HTMLElement>(paragraphSelector))) {
    const previous = paragraph.previousElementSibling
    paragraph.style.removeProperty('text-indent')
    if (
      previous?.matches(paragraphSelector) &&
      !previous.textContent?.trim() &&
      paragraph.style.textAlign !== 'center'
    ) {
      paragraph.style.textIndent = '2em'
    }
  }

  addReadAlongMetadata(document, timeline)

  return document.body.innerHTML
}

export function NovelChapterContent({
  content,
  settings,
  audioUrl,
  audioTimeline,
  showAudioPlayer,
  onBackToContent,
}: {
  content: string
  settings: ReadingSettings
  audioUrl: string | null
  audioTimeline: AudioTimelineEntry[]
  showAudioPlayer: boolean
  onBackToContent: () => void
}) {
  const { isProduction, preventInteraction } = useReaderContentProtection({ replaceNovelCopy: true })
  const [sanitizedContent, setSanitizedContent] = useState<{
    source: string
    html: string
  } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const activeParagraphRef = useRef<HTMLElement | null>(null)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const theme = READING_THEMES[settings.theme]
  const safeContent = sanitizedContent?.source === content ? sanitizedContent.html : null

  useEffect(() => {
    setSanitizedContent({
      source: content,
      html: sanitizeChapterHtml(content, audioTimeline),
    })
  }, [audioTimeline, content])

  useEffect(() => {
    if (showAudioPlayer) return
    activeParagraphRef.current = null
    contentRef.current?.querySelectorAll<HTMLElement>('[data-read-along-start]').forEach((paragraph) => {
      paragraph.classList.remove('bg-primary/15', 'rounded-md')
    })
  }, [showAudioPlayer])

  function updateReadAlong(currentTime: number) {
    const root = contentRef.current
    if (!root) return
    let active: HTMLElement | null = null
    root.querySelectorAll<HTMLElement>('[data-read-along-start]').forEach((paragraph) => {
      const start = Number(paragraph.dataset.readAlongStart)
      const end = Number(paragraph.dataset.readAlongEnd)
      const isActive = Number.isFinite(start) && Number.isFinite(end) && currentTime >= start && currentTime < end
      paragraph.classList.toggle('bg-primary/15', isActive)
      paragraph.classList.toggle('rounded-md', isActive)
      paragraph.classList.add('transition-colors')
      if (isActive) active = paragraph
    })
    if (active && active !== activeParagraphRef.current) {
      activeParagraphRef.current = active
      active.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function seekReadAlong(event: MouseEvent<HTMLDivElement>) {
    if (!showAudioPlayer || !audioUrl || !contentRef.current) return
    const paragraph = [...contentRef.current.querySelectorAll<HTMLElement>('[data-read-along-start]')].find((element) => {
      const rect = element.getBoundingClientRect()
      return event.clientY >= rect.top && event.clientY <= rect.bottom
    })
    if (!paragraph) return
    const start = Number(paragraph.dataset.readAlongStart)
    const end = Number(paragraph.dataset.readAlongEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    setSeekRequest({ id: Date.now(), time: (start + end) / 2 })
  }

  return (
    <article
      className="px-4 py-8 transition-colors sm:px-10 sm:py-12 lg:px-16"
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      {showAudioPlayer && audioUrl ? (
        <NovelAudioPlayer
          audioUrl={audioUrl}
          themeBackground={theme.background}
          themeText={theme.text}
          onBackToContent={onBackToContent}
          onTimeChange={updateReadAlong}
          seekRequest={seekRequest}
        />
      ) : null}
      {safeContent === null ? (
        <ReaderContentSkeleton />
      ) : (
        <div
          className="relative"
          onClick={seekReadAlong}
          onContextMenu={preventInteraction}
          onDragStart={preventInteraction}
        >
          <div
            ref={contentRef}
            className="mx-auto max-w-3xl select-none break-words [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/35 [&_blockquote]:pl-4 [&_h1]:my-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:my-5 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:my-4 [&_h3]:text-xl [&_h3]:font-bold [&_hr]:my-8 [&_img]:mx-auto [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:min-h-[1lh] [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7"
            style={{
              fontFamily: READING_FONTS[settings.fontFamily].family,
              fontWeight: READING_FONTS[settings.fontFamily].weight,
              fontSize: settings.fontSize,
              lineHeight: 2,
            }}
            dangerouslySetInnerHTML={{ __html: safeContent }}
          />
          {isProduction ? (
            <div
              aria-hidden
              className="absolute inset-0 z-10 cursor-text"
              onContextMenu={preventInteraction}
              onDragStart={preventInteraction}
            />
          ) : null}
        </div>
      )}
    </article>
  )
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function NovelAudioPlayer({
  audioUrl,
  themeBackground,
  themeText,
  onBackToContent,
  onTimeChange,
  seekRequest,
}: {
  audioUrl: string
  themeBackground: string
  themeText: string
  onBackToContent: () => void
  onTimeChange: (currentTime: number) => void
  seekRequest: { id: number; time: number } | null
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showAudioControls, setShowAudioControls] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.play().catch(() => setIsPlaying(false))
  }, [audioUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.playbackRate = playbackRate
  }, [playbackRate, volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !seekRequest) return
    audio.currentTime = seekRequest.time
    setCurrentTime(seekRequest.time)
    onTimeChange(seekRequest.time)
  }, [onTimeChange, seekRequest])

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
    }
  }

  function restart() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => setIsPlaying(false))
  }

  return (
    <article
      className="flex items-center justify-center px-3 py-5 sm:min-h-[32rem] sm:px-10 sm:py-14 lg:px-16"
      style={{ backgroundColor: themeBackground, color: themeText }}
    >
      <div className="w-full max-w-lg rounded-[1.5rem] border border-current/10 bg-black/[0.035] p-5 text-center shadow-sm sm:rounded-[2rem] sm:p-10">
        <div
          className={`relative mx-auto mt-3 grid size-40 place-items-center rounded-full bg-zinc-950 shadow-[inset_0_0_0_0.5rem_rgba(255,255,255,0.06),0_1.25rem_2.5rem_rgba(0,0,0,0.22)] sm:mt-8 sm:size-64 ${isPlaying ? 'animate-[spin_5s_linear_infinite] motion-reduce:animate-none' : ''}`}
          style={{
            backgroundImage:
              'repeating-radial-gradient(circle at center, #121212 0 7px, #292929 8px 9px, #111111 10px 15px)',
          }}
        >
          <div className="grid size-14 place-items-center rounded-full border-[0.45rem] border-black/20 bg-primary shadow-[inset_0_0_0_0.35rem_rgba(255,255,255,0.14)] sm:size-20 sm:border-[0.6rem]">
            <div className="size-3 rounded-full bg-background/90 shadow-inner" />
          </div>
        </div>

        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime
            setCurrentTime(nextTime)
            onTimeChange(nextTime)
          }}
        />

        <div className="mt-6 flex items-center gap-2 text-xs font-bold tabular-nums opacity-75 sm:mt-8 sm:gap-3">
          <span>{formatAudioTime(currentTime)}</span>
          <input
            aria-label="ตำแหน่งการเล่นเสียง"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            className="h-1 w-full cursor-pointer accent-primary"
            onChange={(event) => {
              const nextTime = Number(event.target.value)
              if (audioRef.current) audioRef.current.currentTime = nextTime
              setCurrentTime(nextTime)
            }}
          />
          <span>{formatAudioTime(duration)}</span>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 sm:mt-7 sm:gap-3">
          <Button type="button" variant="ghost" size="icon-lg" aria-label="เริ่มเสียงใหม่" onClick={restart}>
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-lg"
            className="size-14 rounded-full"
            aria-label={isPlaying ? 'หยุดเสียงชั่วคราว' : 'เล่นเสียง'}
            onClick={togglePlayback}
          >
            {isPlaying ? (
              <Pause className="size-6" aria-hidden="true" />
            ) : (
              <Play className="size-6" aria-hidden="true" />
            )}
          </Button>
          <span className="flex size-9 items-center justify-center" aria-hidden="true">
            {volume === 0 ? <VolumeX className="size-4" /> : volume < 0.5 ? <Volume1 className="size-4" /> : <Volume2 className="size-4" />}
          </span>
        </div>

        <div className="mt-5 border-t border-current/10 pt-2 text-left sm:mt-7 sm:pt-4">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-expanded={showAudioControls}
            aria-controls="reader-audio-controls"
            onClick={() => setShowAudioControls((show) => !show)}
          >
            <span className="flex items-center gap-2">
              <Volume2 className="size-4" aria-hidden="true" />
              <span className="tabular-nums">{Math.round(volume * 100)}% · {playbackRate}×</span>
            </span>
            {showAudioControls ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
          </button>

          <div id="reader-audio-controls" hidden={!showAudioControls} className="grid gap-4 px-2 pb-1 pt-3 sm:gap-5 sm:pt-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <label htmlFor="reader-audio-volume">ระดับเสียง</label>
                <span className="tabular-nums opacity-70">{Math.round(volume * 100)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-current transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={volume === 0 ? 'เปิดเสียง' : 'ปิดเสียง'}
                  onClick={() => setVolume((current) => (current === 0 ? 1 : 0))}
                >
                  {volume === 0 ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
                </button>
                <input
                  id="reader-audio-volume"
                  aria-label="ระดับเสียง"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  className="h-1 w-full cursor-pointer accent-primary"
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </div>
            </div>

            <div>
              <span className="mb-2 block text-sm">ความเร็วการอ่าน</span>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="group" aria-label="ความเร็วการอ่าน">
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <Button
                    key={rate}
                    type="button"
                    variant={playbackRate === rate ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 px-1 text-xs tabular-nums sm:h-9"
                    aria-pressed={playbackRate === rate}
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate}×
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <Button type="button" variant="link" className="mt-3" onClick={onBackToContent}>
          ปิด Read Along
        </Button>
      </div>
    </article>
  )
}
