'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { UploadCloud } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { STORY_COVER_ACCEPTED_TYPES, STORY_COVER_MAX_FILE_SIZE } from '@/constants/story.constant'
import { useCreateStoryForm } from './create-story-form'

interface CoverImageUploadProps {
  initialCoverUrl?: string | null
}

export function CoverImageUpload({ initialCoverUrl = null }: CoverImageUploadProps) {
  const { clearFieldError } = useCreateStoryForm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialCoverUrl)

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const rejectSelection = () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    if (inputRef.current) inputRef.current.value = ''
    setPreviewUrl(initialCoverUrl)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    clearFieldError('cover')

    if (!STORY_COVER_ACCEPTED_TYPES.includes(file.type as (typeof STORY_COVER_ACCEPTED_TYPES)[number])) {
      rejectSelection()
      return
    }

    if (file.size > STORY_COVER_MAX_FILE_SIZE) {
      rejectSelection()
      return
    }

    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    const nextPreviewUrl = URL.createObjectURL(file)
    setPreviewUrl(nextPreviewUrl)
  }

  return (
    <div data-field="cover">
      {previewUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="เลือกรูปปกใหม่"
          className="group relative aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-2xl bg-muted"
        >
          <img src={previewUrl} alt="ตัวอย่างรูปปก" className="size-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-primary shadow-sm">
              <UploadCloud className="size-6" strokeWidth={1.8} />
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[3/4] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border px-5 py-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <UploadCloud className="size-6" strokeWidth={1.8} />
          </span>
          <span className="mt-3 text-sm font-bold">เลือกไฟล์รูปปก</span>
          <span className="mt-1 text-xs text-muted-foreground">JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB</span>
          <span className="mt-1 text-xs text-muted-foreground">ขนาดแนะนำ 1200 × 1600 px</span>
        </button>
      )}

      <Input
        id="cover-file"
        ref={inputRef}
        type="file"
        name="cover"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="เลือกไฟล์รูปปก"
      />

    </div>
  )
}
