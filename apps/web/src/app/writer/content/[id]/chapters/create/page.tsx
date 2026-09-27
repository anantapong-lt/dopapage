'use client'

import { use, useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { ChapterImport } from './chapter-import'
import { useRouter } from 'next/navigation'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeftIcon, ImagePlusIcon, LoaderCircleIcon, Trash2Icon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { RichTextEditor } from '@/components/common/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StoryType } from '@/constants/story.constant'
import {
  createWriterChapter,
  getWriterChapter,
  getWriterChapters,
  getWriterContent,
  updateWriterChapter,
} from '@/controllers/writer.controller'
import type { ChapterStatus, WriterChapterDetail } from '@/interface/writer-chapter.interface'

const chapterStatusOptions: { value: ChapterStatus; label: string }[] = [
  { value: 'draft', label: 'ฉบับร่าง' },
  { value: 'scheduled', label: 'ตั้งเวลาเผยแพร่' },
  { value: 'published', label: 'เผยแพร่' },
  { value: 'hidden', label: 'ซ่อน' },
]

interface ChapterImage {
  id: string
  file?: File
  pageId?: string
  previewUrl: string
}

interface CreateChapterPageProps {
  params: Promise<{ id: string; chapterId?: string }>
}

function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function SortableChapterImage({
  image,
  index,
  onRemove,
  disabled,
}: {
  image: ChapterImage
  index: number
  onRemove: (imageId: string) => void
  disabled: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled,
  })

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative rounded-xl border border-border p-2 transition-[border-color,box-shadow,transform] ${disabled ? '' : 'cursor-grab touch-none hover:-translate-y-0.5 hover:border-primary hover:shadow-md active:cursor-grabbing'} ${isDragging ? 'z-20 opacity-50 shadow-lg' : ''}`}
      {...(!disabled ? attributes : {})}
      {...(!disabled ? listeners : {})}
    >
      <span className="absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-full bg-background/90 text-xs font-bold shadow-sm">
        {index + 1}
      </span>
      <button
        type="button"
        onClick={() => onRemove(image.id)}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`ลบรูปที่ ${index + 1}`}
        className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-lg bg-destructive text-destructive-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <XIcon className="size-4" />
      </button>
      <div className="aspect-[3/4] overflow-hidden rounded-lg bg-muted">
        <img
          src={image.previewUrl}
          alt={`ตัวอย่างรูปที่ ${index + 1}: ${image.file?.name ?? 'รูปเดิม'}`}
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </div>
    </article>
  )
}

function SelectableChapterImage({
  image,
  index,
  selected,
  onSelectionChange,
}: {
  image: ChapterImage
  index: number
  selected: boolean
  onSelectionChange: (imageId: string, selected: boolean) => void
}) {
  return (
    <article
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          onSelectionChange(image.id, !selected)
        }
      }}
      className={`group relative rounded-xl border p-2 text-left transition-[border-color,box-shadow,transform] ${selected ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border hover:border-primary/60 hover:bg-primary/5'}`}
    >
      <span className="absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-full bg-background/90 text-xs font-bold shadow-sm">
        {index + 1}
      </span>
      <span className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-lg bg-background/90 shadow-sm">
        <Checkbox
          checked={selected}
          aria-label={`เลือกรูปที่ ${index + 1}`}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => onSelectionChange(image.id, checked === true)}
        />
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onSelectionChange(image.id, !selected)
        }}
        className="block aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-lg bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`เลือกรูปที่ ${index + 1}`}
      >
        <img
          src={image.previewUrl}
          alt={`ตัวอย่างรูปที่ ${index + 1}: ${image.file?.name ?? 'รูปเดิม'}`}
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </button>
    </article>
  )
}

export default function CreateChapterPage({ params }: CreateChapterPageProps) {
  const { id, chapterId } = use(params)
  const router = useRouter()
  const { accessToken, status: authStatus } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<ChapterImage[]>([])
  const [storyType, setStoryType] = useState<StoryType | null>(null)
  const [chapter, setChapter] = useState<WriterChapterDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chapterStatus, setChapterStatus] = useState<ChapterStatus>('published')
  const [chapterNumber, setChapterNumber] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [images, setImages] = useState<ChapterImage[]>([])
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [isSelectingImages, setIsSelectingImages] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isImportBusy, setIsImportBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const chaptersHref = `/writer/content/${id}/chapters`
  const imageSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const handleChapterStatusChange = useCallback((value: string) => {
    const nextStatus = value as ChapterStatus
    setChapterStatus((current) => (current === nextStatus ? current : nextStatus))
  }, [])

  useEffect(() => {
    if (!accessToken) {
      if (authStatus === 'unauthenticated') {
        setLoadError('ไม่พบข้อมูลการเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง')
      }
      return
    }

    let cancelled = false
    setLoadError(null)

    void Promise.all([
      getWriterContent(id, accessToken),
      chapterId ? getWriterChapter(id, chapterId, accessToken) : Promise.resolve(null),
      chapterId ? Promise.resolve(null) : getWriterChapters(id, '', 'chapter_desc', 1, 1, accessToken),
    ])
      .then(([{ story }, chapterResponse, chaptersResponse]) => {
        if (!cancelled) {
          setStoryType(story.type)
          if (chapterResponse) {
            setChapter(chapterResponse.chapter)
            setChapterNumber(chapterResponse.chapter.chapter_number)
            setChapterStatus(chapterResponse.chapter.status)
            setScheduledAt(toLocalDateTime(chapterResponse.chapter.published_at))
            setImages(
              chapterResponse.chapter.pages.map((page) => ({
                id: page.id,
                pageId: page.id,
                previewUrl: page.image_url,
              })),
            )
          } else {
            const latestChapterNumber = Number(chaptersResponse?.chapters[0]?.chapter_number ?? 0)
            setChapterNumber(String(Number((latestChapterNumber + 1).toFixed(1))))
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลผลงานได้')
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, authStatus, chapterId, id])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(
    () => () => {
      for (const image of imagesRef.current) {
        if (image.file) URL.revokeObjectURL(image.previewUrl)
      }
    },
    [],
  )

  const addImages = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setImages((current) => [
      ...current,
      ...imageFiles.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ])
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDragging(false)
    addImages(Array.from(event.dataTransfer.files))
  }

  const removeImage = (imageId: string) => {
    setImages((current) => {
      const removedImage = current.find((image) => image.id === imageId)
      if (removedImage?.file) URL.revokeObjectURL(removedImage.previewUrl)
      return current.filter((image) => image.id !== imageId)
    })
    setSelectedImageIds((current) => {
      const next = new Set(current)
      next.delete(imageId)
      return next
    })
  }

  const setImageSelection = (imageId: string, selected: boolean) => {
    setSelectedImageIds((current) => {
      const next = new Set(current)
      if (selected) next.add(imageId)
      else next.delete(imageId)
      return next
    })
  }

  const removeSelectedImages = () => {
    setImages((current) => {
      for (const image of current) {
        if (selectedImageIds.has(image.id) && image.file) URL.revokeObjectURL(image.previewUrl)
      }
      return current.filter((image) => !selectedImageIds.has(image.id))
    })
    setSelectedImageIds(new Set())
    setIsSelectingImages(false)
  }

  const handleImageDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setImages((current) => {
      const oldIndex = current.findIndex((image) => image.id === active.id)
      const newIndex = current.findIndex((image) => image.id === over.id)
      return oldIndex === -1 || newIndex === -1 ? current : arrayMove(current, oldIndex, newIndex)
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || !accessToken || !storyType) return

    if (isCartoon && images.length === 0) {
      setSubmitError('กรุณาเพิ่มรูปภาพอย่างน้อย 1 รูป')
      return
    }

    const body = new FormData(event.currentTarget)
    if (body.get('price') === '') body.delete('price')
    body.delete('images')
    if (isCartoon) {
      for (const image of images) {
        if (image.file) body.append('images', image.file)
      }
      if (chapterId) {
        body.set('retained_page_ids', JSON.stringify(images.flatMap((image) => (image.pageId ? [image.pageId] : []))))
      }
    }

    if (chapterStatus === 'scheduled') {
      const scheduledAt = body.get('published_at')
      if (typeof scheduledAt !== 'string' || !scheduledAt) {
        setSubmitError('กรุณาระบุวันและเวลาเผยแพร่')
        return
      }
      body.set('published_at', new Date(scheduledAt).toISOString())
    } else {
      body.delete('published_at')
    }

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      if (chapterId) {
        await updateWriterChapter(id, chapterId, body, accessToken)
      } else {
        await createWriterChapter(id, body, accessToken)
      }
      toast.success(chapterId ? 'แก้ไขตอนเรียบร้อยแล้ว' : 'สร้างตอนเรียบร้อยแล้ว')
      router.push(chaptersHref)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : chapterId ? 'ไม่สามารถแก้ไขตอนได้' : 'ไม่สามารถสร้างตอนได้'
      setSubmitError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if ((!storyType || (chapterId && !chapter)) && !loadError) {
    return (
      <section className="mt-6 space-y-5">
        <Skeleton className="h-11 w-28 rounded-xl" />
        <div className="readji-surface grid gap-5 rounded-2xl p-5 md:grid-cols-2 md:p-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <div className="space-y-2 md:col-span-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="mt-6">
        <div className="readji-surface rounded-2xl p-8 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button asChild variant="outline" className="mt-4 h-11 rounded-xl">
            <Link href={chaptersHref}>
              <ArrowLeftIcon />
              ย้อนกลับ
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  const isCartoon = storyType === StoryType.MANGA

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href={chaptersHref}>
            <ArrowLeftIcon />
            ย้อนกลับ
          </Link>
        </Button>
        <span className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
          {isCartoon ? 'การ์ตูน' : 'นิยาย'}
        </span>
      </div>

      {!chapterId && (
        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            disabled={isImportBusy}
            variant={isImporting ? 'outline' : 'default'}
            onClick={() => setIsImporting(false)}
          >
            สร้างทีละตอน
          </Button>
          <Button
            type="button"
            disabled={isImportBusy}
            variant={isImporting ? 'default' : 'outline'}
            onClick={() => setIsImporting(true)}
          >
            อัปโหลด ZIP หลายตอน
          </Button>
        </div>
      )}
      {isImporting && (
        <ChapterImport
          contentId={id}
          isManga={isCartoon}
          onCancel={() => setIsImporting(false)}
          onBusyChange={setIsImportBusy}
        />
      )}
      <form onSubmit={handleSubmit} className={`mt-6 space-y-5 ${isImporting ? 'hidden' : ''}`}>
        <section className="readji-surface grid gap-5 rounded-2xl p-5 md:grid-cols-2 md:p-6">
          <div className="space-y-2">
            <Label htmlFor="chapter-title" className="text-sm font-semibold">
              ชื่อตอน
            </Label>
            <Input
              id="chapter-title"
              name="title"
              defaultValue={chapter?.title ?? ''}
              placeholder="กรอกชื่อตอน"
              maxLength={255}
              className="h-11 rounded-xl px-3"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapter-number" className="text-sm font-semibold">
              ตอนที่ <span className="text-destructive">*</span>
            </Label>
            <Input
              id="chapter-number"
              name="chapter_number"
              value={chapterNumber}
              onChange={(event) => setChapterNumber(event.target.value)}
              type="number"
              min={0}
              step="0.1"
              placeholder="กรอกเลขตอน"
              required
              className="h-11 rounded-xl px-3"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapter-price" className="text-sm font-semibold">
              ราคา
            </Label>
            <Input
              id="chapter-price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={chapter?.price ?? ''}
              placeholder="เว้นว่าง = ฟรี"
              className="h-11 rounded-xl px-3"
            />
            <p className="text-xs text-muted-foreground">เว้นว่างสำหรับตอนอ่านฟรี</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapter-status" className="text-sm font-semibold">
              สถานะ <span className="text-destructive">*</span>
            </Label>
            <Select name="status" value={chapterStatus} onValueChange={handleChapterStatusChange}>
              <SelectTrigger id="chapter-status" className="h-11! w-full rounded-xl px-3">
                <SelectValue placeholder="เลือกสถานะ" />
              </SelectTrigger>
              <SelectContent>
                {chapterStatusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chapterStatus === 'scheduled' && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="chapter-published-at" className="text-sm font-semibold">
                วันและเวลาเผยแพร่ <span className="text-destructive">*</span>
              </Label>
              <input id="chapter-published-at" name="published_at" type="hidden" value={scheduledAt} required />
              <DateTimePicker
                value={scheduledAt}
                onChange={setScheduledAt}
                disabled={isSubmitting}
                label="วันและเวลาเผยแพร่"
              />
            </div>
          )}
        </section>

        {isCartoon ? (
          <section className="readji-surface rounded-2xl p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Label className="text-sm font-semibold">
                รูปภาพ ({images.length} รูป) <span className="text-destructive">*</span>
              </Label>
              {images.length > 0 &&
                (isSelectingImages ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">เลือกแล้ว {selectedImageIds.size} รูป</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedImageIds(new Set())
                        setIsSelectingImages(false)
                      }}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={selectedImageIds.size === 0}
                      onClick={removeSelectedImages}
                    >
                      <Trash2Icon />
                      ลบที่เลือก
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsSelectingImages(true)}>
                    <Trash2Icon />
                    เลือกลบ
                  </Button>
                ))}
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className={`flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary hover:bg-primary/5'
              }`}
            >
              <ImagePlusIcon className="size-9 text-muted-foreground" strokeWidth={1.8} />
              <span className="mt-3 text-sm font-bold">คลิกเพื่อเพิ่มรูปภาพ</span>
              <span className="mt-1 text-xs text-muted-foreground">หรือลากไฟล์มาวางที่นี่</span>
            </button>
            <Input
              ref={fileInputRef}
              type="file"
              name="images"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="sr-only"
              aria-label="เลือกรูปภาพตอนการ์ตูน"
            />

            {images.length > 0 && (
              <div className="mt-4 max-h-[26rem] overflow-y-auto rounded-xl border border-border p-3">
                {isSelectingImages ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {images.map((image, index) => (
                      <SelectableChapterImage
                        key={image.id}
                        image={image}
                        index={index}
                        selected={selectedImageIds.has(image.id)}
                        onSelectionChange={setImageSelection}
                      />
                    ))}
                  </div>
                ) : (
                  <DndContext sensors={imageSensors} collisionDetection={closestCenter} onDragEnd={handleImageDragEnd}>
                    <SortableContext items={images.map((image) => image.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {images.map((image, index) => (
                          <SortableChapterImage
                            key={image.id}
                            image={image}
                            index={index}
                            onRemove={removeImage}
                            disabled={!chapterId}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="readji-surface rounded-2xl p-5 md:p-6">
            <div className="space-y-2">
              <Label htmlFor="chapter-content" className="text-sm font-semibold">
                เนื้อหา <span className="text-destructive">*</span>
              </Label>
              <RichTextEditor id="chapter-content" initialContent={chapter?.content ?? ''} />
            </div>
          </section>
        )}

        <div className="flex justify-end gap-3 border-t border-border pt-5">
          {submitError && (
            <p role="alert" className="mr-auto self-center text-sm text-destructive">
              {submitError}
            </p>
          )}
          <Button asChild type="button" variant="outline" className="h-11 rounded-xl px-5">
            <Link href={chaptersHref}>ยกเลิก</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl px-5 font-bold">
            {isSubmitting && <LoaderCircleIcon className="animate-spin" />}
            {isSubmitting ? (chapterId ? 'กำลังบันทึก...' : 'กำลังสร้าง...') : chapterId ? 'บันทึก' : 'สร้าง'}
          </Button>
        </div>
      </form>
    </section>
  )
}
