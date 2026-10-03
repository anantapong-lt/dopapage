'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { ChapterPurchaseDialog } from '@/components/content/chapter-purchase-dialog'
import { purchaseChapters } from '@/controllers/chapter-purchase.controller'
import { getReadingSettings, updateReadingSettings } from '@/controllers/reading-settings.controller'
import type {
  PublicChapter,
  PublicChapterResponse,
  PublicReaderChapter,
} from '@/interface/content.interface'
import {
  DEFAULT_READING_SETTINGS,
  type ReadingSettings,
} from '@/lib/reading-settings'
import { ApiError } from '@/lib/api-client'
import { ChapterNavigation } from './chapter-navigation'
import { ChapterComments } from './chapter-comments'
import { ChapterReaderHeader } from './chapter-reader-header'
import { MangaChapterContent } from './manga-chapter-content'
import { NovelChapterContent } from './novel-chapter-content'

function toPurchasableChapter(chapter: PublicReaderChapter): PublicChapter {
  return {
    ...chapter,
    is_owner: false,
    has_audio: false,
  }
}

export function ChapterReader({ data, commentsEnabled }: { data: PublicChapterResponse; commentsEnabled: boolean }) {
  const router = useRouter()
  const { accessToken, refresh, status, user } = useAuth()
  const [settings, setSettings] = useState<ReadingSettings>(DEFAULT_READING_SETTINGS)
  const [chapters, setChapters] = useState(data.chapters)
  const [pendingChapter, setPendingChapter] = useState<PublicReaderChapter | null>(null)
  const [readerNavbarVisible, setReaderNavbarVisible] = useState(true)
  const [navigationVisible, setNavigationVisible] = useState(false)
  const [showAudioPlayer, setShowAudioPlayer] = useState(false)
  const [audioStartTime, setAudioStartTime] = useState(0)
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1)
  const [isAutoReading, setIsAutoReading] = useState(false)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const isAutoAdvancingRef = useRef(false)
  const hasChangedReadingSettingsRef = useRef(false)
  const selectedAudio = data.audio_versions.find((audio) => audio.voice_slot === settings.preferredTtsVoice)
    ?? data.audio_versions[0]
    ?? (data.audio_url ? {
      voice_slot: settings.preferredTtsVoice,
      audio_url: data.audio_url,
      audio_timeline: data.audio_timeline,
    } : null)

  function seekAudio(time: number) {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(time) || time < 0) return
    audio.currentTime = Number.isFinite(audio.duration) ? Math.min(time, audio.duration) : time
    setAudioCurrentTime(audio.currentTime)
    void audio.play().catch(() => setIsAutoReading(false))
  }

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return
    let isCurrent = true
    void getReadingSettings(accessToken)
      .then(({ reading_settings }) => {
        if (isCurrent && !hasChangedReadingSettingsRef.current) setSettings(reading_settings)
      })
      .catch(() => {
        // Reader settings remain usable with defaults when the preference request fails.
      })
    return () => {
      isCurrent = false
    }
  }, [accessToken, status])

  useEffect(() => {
    let previousScrollY = window.scrollY
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY <= 0) {
        setReaderNavbarVisible(true)
        setNavigationVisible(false)
      } else if (currentScrollY > previousScrollY + 8) {
        setReaderNavbarVisible(false)
        setNavigationVisible(false)
      } else if (currentScrollY < previousScrollY - 8) {
        setReaderNavbarVisible(false)
        setNavigationVisible(true)
      }
      previousScrollY = currentScrollY
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function updateSettings(nextSettings: ReadingSettings) {
    hasChangedReadingSettingsRef.current = true
    setSettings(nextSettings)
    if (status !== 'authenticated' || !accessToken) return
    void updateReadingSettings(nextSettings, accessToken).catch(() => {
      toast.error('ไม่สามารถบันทึกการตั้งค่าการอ่านได้ กรุณาลองใหม่อีกครั้ง')
    })
  }

  function navigateToChapter(chapter: PublicReaderChapter) {
    if (!chapter.can_read) {
      setPendingChapter(chapter)
      return
    }

    router.push(
      `/content/${encodeURIComponent(data.story.slug)}/${encodeURIComponent(String(Number(chapter.chapter_number)))}`,
    )
  }

  async function handleAutoReadEnded() {
    const currentIndex = chapters.findIndex((chapter) => chapter.chapter_number === data.chapter.chapter_number)
    const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : null

    if (!settings.autoNext || !nextChapter || isAutoAdvancingRef.current) return

    if (nextChapter.can_read || !settings.autoPurchase) {
      navigateToChapter(nextChapter)
      return
    }

    const hasEnoughBalance = Number(user?.balance ?? 0) >= Number(nextChapter.price)
    if (status !== 'authenticated' || !accessToken || !hasEnoughBalance) {
      setPendingChapter(nextChapter)
      return
    }

    isAutoAdvancingRef.current = true
    try {
      const result = await purchaseChapters([nextChapter.id], accessToken)
      await refresh()
      const purchasedIds = new Set(result.purchases.map((purchase) => purchase.chapter_id))
      setChapters((current) => current.map((chapter) => (
        purchasedIds.has(chapter.id)
          ? { ...chapter, is_purchased: true, can_read: true }
          : chapter
      )))
      router.push(
        `/content/${encodeURIComponent(data.story.slug)}/${encodeURIComponent(String(Number(nextChapter.chapter_number)))}`,
      )
      toast.success('ซื้อตอนถัดไปอัตโนมัติสำเร็จแล้ว')
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'ไม่สามารถซื้อตอนถัดไปอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง',
      )
      setPendingChapter(nextChapter)
    } finally {
      isAutoAdvancingRef.current = false
    }
  }

  function handlePurchased(chapterIds: string[]) {
    const purchasedIds = new Set(chapterIds)
    setChapters((current) => current.map((chapter) => (
      purchasedIds.has(chapter.id)
        ? { ...chapter, is_purchased: true, can_read: true }
        : chapter
    )))

    if (pendingChapter && purchasedIds.has(pendingChapter.id)) {
      router.push(
        `/content/${encodeURIComponent(data.story.slug)}/${encodeURIComponent(String(Number(pendingChapter.chapter_number)))}`,
      )
    }
    setPendingChapter(null)
  }

  return (
    <div className="mx-auto w-full max-w-7xl py-4 sm:px-6 sm:py-8">
      <section
        className="readji-surface overflow-visible rounded-2xl sm:rounded-[1.75rem]"
        data-reader-type={data.story.type}
      >
        <ChapterReaderHeader
          slug={data.story.slug}
          storyTitle={data.story.title}
          chapterNumber={data.chapter.chapter_number}
          chapterTitle={data.chapter.title}
          chapters={chapters}
          showReadingSettings={data.story.type === 'novel'}
          hasAudio={data.story.type === 'novel' && Boolean(selectedAudio)}
          audioUrl={selectedAudio?.audio_url ?? null}
          audioVersions={data.audio_versions}
          selectedVoiceSlot={selectedAudio?.voice_slot ?? null}
          settings={settings}
          navbarVisible={readerNavbarVisible}
          onSettingsChange={updateSettings}
          onVoiceSlotChange={(voiceSlot) => updateSettings({ ...settings, preferredTtsVoice: voiceSlot })}
          onAudioTimeChange={setAudioCurrentTime}
          onAudioPlayingChange={setIsAutoReading}
          audioRef={audioRef}
          onNavigate={navigateToChapter}
          onAutoReadEnded={handleAutoReadEnded}
        />

        <div className="overflow-hidden rounded-b-2xl sm:rounded-b-[1.75rem]">
          {data.story.type === 'manga' ? (
            <MangaChapterContent
              storyTitle={data.story.title}
              slug={data.story.slug}
              chapterNumber={data.chapter.chapter_number}
              initialPages={data.pages}
              initialPagination={data.manga_page_pagination}
            />
          ) : (
            <NovelChapterContent
              content={data.content ?? ''}
              settings={settings}
              audioUrl={selectedAudio?.audio_url ?? null}
              audioTimeline={selectedAudio?.audio_timeline ?? []}
              showAudioPlayer={showAudioPlayer}
              initialAudioTime={audioStartTime}
              initialPlaybackRate={audioPlaybackRate}
              isAutoReading={isAutoReading}
              audioCurrentTime={audioCurrentTime}
              onSeekAudio={seekAudio}
              onBackToContent={() => setShowAudioPlayer(false)}
            />
          )}
          <ChapterNavigation
            chapters={chapters}
            currentChapterNumber={data.chapter.chapter_number}
            onNavigate={navigateToChapter}
          />
        </div>
      </section>

      <ChapterNavigation
        chapters={chapters}
        currentChapterNumber={data.chapter.chapter_number}
        onNavigate={navigateToChapter}
        floating
        visible={navigationVisible}
      />

      {commentsEnabled ? (
        <ChapterComments
          slug={data.story.slug}
          chapterNumber={String(Number(data.chapter.chapter_number))}
        />
      ) : null}

      {pendingChapter ? (
        <ChapterPurchaseDialog
          chapters={[toPurchasableChapter(pendingChapter)]}
          storyTitle={data.story.title}
          coverUrl={data.story.cover_url}
          open
          onOpenChange={(open) => {
            if (!open) setPendingChapter(null)
          }}
          onPurchased={handlePurchased}
        />
      ) : null}
    </div>
  )
}
