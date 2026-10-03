'use client'

import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from 'lucide-react'
import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReadingSettings } from '@/lib/reading-settings'
import { READING_FONTS, READING_THEMES } from '@/lib/reading-settings'
import { ReaderContentSkeleton } from './reader-content-skeleton'
import { useReaderContentProtection } from './use-reader-content-protection'

type AudioTimelineEntry = {
  text?: string
  start_offset?: number
  end_offset?: number
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

function addReadAlongMetadata(document: Document, timeline: AudioTimelineEntry[], source: string) {
  // Match actual text, including bare text and text split across formatting tags.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; start: number; offsets: number[] }> = []
  let spokenText = ''
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const offsets: number[] = []
    const start = spokenText.length
    for (let i = 0; i < node.data.length; i += 1) {
      if (/\s/.test(node.data[i])) continue
      offsets.push(i)
      spokenText += node.data[i]
    }
    if (offsets.length) nodes.push({ node, start, offsets })
  }
  const matches: Array<{ start: number; end: number; entry: AudioTimelineEntry }> = []
  let cursor = 0
  for (const entry of timeline) {
    if (!Number.isFinite(entry.start_seconds)
      || !Number.isFinite(entry.end_seconds) || entry.end_seconds <= entry.start_seconds) continue
    // New entries reference UTF-16 positions in the original HTML. Keep old
    // text timelines readable until their audio is regenerated.
    const hasOffsets = Number.isInteger(entry.start_offset) && Number.isInteger(entry.end_offset)
      && entry.start_offset! >= 0 && entry.end_offset! > entry.start_offset!
      && entry.end_offset! <= source.length
    const text = (hasOffsets
      ? new DOMParser().parseFromString(source.slice(entry.start_offset, entry.end_offset), 'text/html').body.textContent ?? ''
      : entry.text ?? '').replace(/\s/g, '')
    if (!text) continue
    const start = spokenText.indexOf(text, cursor)
    if (start < 0) continue
    cursor = start + text.length
    matches.push({ start, end: cursor, entry })
  }
  for (const { node, start, offsets } of nodes) {
    const fragment = document.createDocumentFragment()
    let offset = 0
    for (const match of matches) {
      const from = Math.max(start, match.start)
      const to = Math.min(start + offsets.length, match.end)
      if (from >= to) continue
      const first = offsets[from - start]
      const last = offsets[to - start - 1] + 1
      fragment.append(document.createTextNode(node.data.slice(offset, first)))
      const span = document.createElement('span')
      // Clone the decoration on wrapped lines without changing text geometry.
      span.className = 'rounded-[0.3em] transition-[background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none'
      span.style.boxDecorationBreak = 'clone'
      span.style.setProperty('-webkit-box-decoration-break', 'clone')
      span.dataset.readAlongStart = String(match.entry.start_seconds)
      span.dataset.readAlongEnd = String(match.entry.end_seconds)
      span.textContent = node.data.slice(first, last)
      fragment.append(span)
      offset = last
    }
    if (!offset) continue
    fragment.append(document.createTextNode(node.data.slice(offset)))
    node.replaceWith(fragment)
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
    const text = paragraph.textContent?.trim() ?? ''
    if (
      text &&
      !paragraph.closest('h1, h2, h3, h4, h5, h6, li, blockquote, pre') &&
      !['center', 'right', 'end'].includes(paragraph.style.textAlign)
    ) {
      const isDialogue = /^[“”"‘’'«「『]/u.test(text)
      paragraph.style.textIndent = isDialogue ? '0' : '2em'
      if (isDialogue) paragraph.style.textAlign = 'left'
    }
  }

  addReadAlongMetadata(document, timeline, html)

  return document.body.innerHTML
}

export function NovelChapterContent({
  content,
  settings,
  audioUrl,
  audioTimeline,
  showAudioPlayer,
  initialAudioTime,
  initialPlaybackRate,
  isAutoReading,
  audioCurrentTime,
  onSeekAudio,
  onBackToContent,
}: {
  content: string
  settings: ReadingSettings
  audioUrl: string | null
  audioTimeline: AudioTimelineEntry[]
  showAudioPlayer: boolean
  initialAudioTime: number
  initialPlaybackRate: number
  isAutoReading: boolean
  audioCurrentTime: number
  onSeekAudio: (time: number) => void
  onBackToContent: () => void
}) {
  const { isProduction, preventInteraction } = useReaderContentProtection({ replaceNovelCopy: true })
  const [sanitizedContent, setSanitizedContent] = useState<{
    source: string
    html: string
  } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoveredTime, setHoveredTime] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [sentenceBox, setSentenceBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const activeParagraphRef = useRef<HTMLElement | null>(null)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const theme = READING_THEMES[settings.theme]
  const safeContent = sanitizedContent?.source === content ? sanitizedContent.html : null
  const contentHtml = useMemo(() => ({ __html: safeContent ?? '' }), [safeContent])

  useEffect(() => {
    setHoveredTime(null)
    setSelectedTime(null)
  }, [content, audioUrl])

  useEffect(() => {
    if (selectedTime === null || !contentRef.current) return
    const selected = [...contentRef.current.querySelectorAll<HTMLElement>('[data-read-along-start]')]
      .filter((element) => element.dataset.readAlongStart === selectedTime)
    const end = Math.max(...selected.map((element) => Number(element.dataset.readAlongEnd)))
    if (Number.isFinite(end) && audioCurrentTime >= end) setSelectedTime(null)
  }, [audioCurrentTime, selectedTime])

  useEffect(() => {
    const root = contentRef.current
    const frame = frameRef.current
    if (!root || !frame) return
    const updateBox = () => {
      const time = hoveredTime ?? selectedTime
      const rects = Array.from(root.querySelectorAll<HTMLElement>('[data-read-along-start]'))
        .filter((element) => element.dataset.readAlongStart === time)
        .flatMap((element) => Array.from(element.getClientRects()))
      if (!rects.length) { setSentenceBox(null); return }
      const origin = frame.getBoundingClientRect()
      const bounds = root.getBoundingClientRect()
      const top = Math.min(...rects.map((rect) => rect.top))
      const bottom = Math.max(...rects.map((rect) => rect.bottom))
      setSentenceBox({ top: top - origin.top - 3, left: bounds.left - origin.left,
        width: bounds.width, height: bottom - top + 6 })
    }
    updateBox()
    const observer = new ResizeObserver(updateBox)
    observer.observe(root)
    return () => observer.disconnect()
  }, [hoveredTime, selectedTime, safeContent, settings.fontSize, settings.fontFamily])

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
      paragraph.style.backgroundColor = ''
      paragraph.style.boxShadow = ''
    })
  }, [showAudioPlayer])

  useEffect(() => {
    if ((!isAutoReading && !activeParagraphRef.current) || safeContent === null) return
    updateReadAlong(audioCurrentTime)
  }, [audioCurrentTime, isAutoReading, safeContent, settings.theme])

  function updateReadAlong(currentTime: number) {
    const root = contentRef.current
    if (!root) return
    const highlight = {
      light: 'rgba(245, 158, 11, 0.30)',
      sepia: 'rgba(180, 120, 45, 0.32)',
      gray: 'rgba(100, 116, 139, 0.30)',
      sage: 'rgba(45, 135, 90, 0.30)',
      dark: 'rgba(148, 163, 184, 0.36)',
    }[settings.theme]
    let active: HTMLElement | null = null
    for (const paragraph of root.querySelectorAll<HTMLElement>('[data-read-along-start]')) {
      const start = Number(paragraph.dataset.readAlongStart)
      const end = Number(paragraph.dataset.readAlongEnd)
      const isActive = Number.isFinite(start) && Number.isFinite(end) && currentTime >= start && currentTime < end
      paragraph.style.backgroundColor = isActive ? highlight : ''
      paragraph.style.boxShadow = isActive ? `0 0 0 0.12em ${highlight}` : ''
      if (isActive && !active) active = paragraph
    }
    if (active && active !== activeParagraphRef.current) {
      activeParagraphRef.current = active
      active.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function findReadAlong(event: MouseEvent<HTMLDivElement>) {
    if (!audioUrl || !contentRef.current) return
    return [...contentRef.current.querySelectorAll<HTMLElement>('[data-read-along-start]')].find((element) => {
      return Array.from(element.getClientRects()).some((rect) => (
        event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom
      ))
    })
  }

  function seekReadAlong(event: MouseEvent<HTMLDivElement>) {
    const paragraph = findReadAlong(event)
    if (!paragraph) return
    const start = Number(paragraph.dataset.readAlongStart)
    const end = Number(paragraph.dataset.readAlongEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    setSelectedTime(paragraph.dataset.readAlongStart ?? null)
    onSeekAudio(start)
    updateReadAlong(start)
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
          initialAudioTime={initialAudioTime}
          initialPlaybackRate={initialPlaybackRate}
          onBackToContent={onBackToContent}
          onTimeChange={updateReadAlong}
          seekRequest={seekRequest}
        />
      ) : null}
      {safeContent === null ? (
        <ReaderContentSkeleton />
      ) : (
        <div
          ref={frameRef}
          className="relative"
          onClick={seekReadAlong}
          onMouseMove={(event) => setHoveredTime(findReadAlong(event)?.dataset.readAlongStart ?? null)}
          onMouseLeave={() => setHoveredTime(null)}
          onContextMenu={preventInteraction}
          onDragStart={preventInteraction}
        >
          {sentenceBox ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-xl border"
              style={{ ...sentenceBox,
                backgroundColor: 'color-mix(in srgb, currentColor 7%, transparent)',
                borderColor: 'color-mix(in srgb, currentColor 16%, transparent)',
              }}
            />
          ) : null}
          <div
            ref={contentRef}
            className="mx-auto max-w-3xl select-none break-words [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/35 [&_blockquote]:pl-4 [&_h1]:my-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:my-5 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:my-4 [&_h3]:text-xl [&_h3]:font-bold [&_hr]:my-8 [&_img]:mx-auto [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:min-h-[1lh] [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7"
            style={{
              fontFamily: READING_FONTS[settings.fontFamily].family,
              fontWeight: READING_FONTS[settings.fontFamily].weight,
              fontSize: settings.fontSize,
              lineHeight: 2,
            }}
            dangerouslySetInnerHTML={contentHtml}
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
  initialAudioTime,
  initialPlaybackRate,
  onBackToContent,
  onTimeChange,
  seekRequest,
}: {
  audioUrl: string
  themeBackground: string
  themeText: string
  initialAudioTime: number
  initialPlaybackRate: number
  onBackToContent: () => void
  onTimeChange: (currentTime: number) => void
  seekRequest: { id: number; time: number } | null
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(initialPlaybackRate)
  const [showAudioControls, setShowAudioControls] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = initialAudioTime
    setCurrentTime(initialAudioTime)
    audio.play().catch(() => setIsPlaying(false))
  }, [audioUrl, initialAudioTime])

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
