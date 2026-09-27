'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Images, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { STORY_TITLE_MAX_LENGTH } from '@/constants/story.constant'
import type { WriterContentTab } from '@/interface/writer-content.interface'

interface CreateContentDialogProps {
  defaultType: WriterContentTab
}

const contentTypes = [
  {
    value: 'novel',
    label: 'นิยาย',
    description: 'เนื้อหาแบบข้อความแบ่งเป็นตอน',
    icon: BookOpen,
  },
  {
    value: 'cartoon',
    label: 'การ์ตูน',
    description: 'เนื้อหาแบบภาพแบ่งเป็นหน้า',
    icon: Images,
  },
] as const

export function CreateContentDialog({ defaultType }: CreateContentDialogProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [alternativeTitle, setAlternativeTitle] = useState('')
  const [contentType, setContentType] = useState<WriterContentTab>(defaultType)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      setTitle('')
      setAlternativeTitle('')
      setContentType(defaultType)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    const params = new URLSearchParams({ type: contentType, title: trimmedTitle })
    if (alternativeTitle.trim()) params.set('alternative_title', alternativeTitle.trim())
    router.push(`/writer/contents/create?${params.toString()}`)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="order-first min-h-10 w-full rounded-lg px-4 py-2 text-sm font-bold hover:text-white sm:w-auto sm:self-end lg:absolute lg:top-0 lg:right-0 lg:order-none">
          <Plus className="size-4" strokeWidth={2} />
          สร้างเนื้อหาใหม่
        </Button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 backdrop-blur-none"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] overflow-y-auto gap-0 rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl ring-0 sm:max-w-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-xl leading-normal font-bold">
              สร้างเนื้อหาใหม่
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              กรอกชื่อเรื่องและเลือกประเภทเนื้อหา
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="ปิดหน้าต่าง"
              className="shrink-0 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-5" strokeWidth={1.8} />
            </Button>
          </DialogClose>
        </div>

        <form className="mt-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="content-title" className="font-semibold">
                ชื่อเรื่อง <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {title.length}/{STORY_TITLE_MAX_LENGTH}
              </span>
            </div>
            <Input
              id="content-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={STORY_TITLE_MAX_LENGTH}
              required
              autoFocus
              placeholder="กรอกชื่อเรื่อง"
              className="h-11 rounded-xl border-border bg-background px-3"
            />
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="content-alternative-title" className="font-semibold">ชื่อเรื่องภาษาอื่น</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {alternativeTitle.length}/{STORY_TITLE_MAX_LENGTH}
              </span>
            </div>
            <Input
              id="content-alternative-title"
              value={alternativeTitle}
              onChange={(event) => setAlternativeTitle(event.target.value)}
              maxLength={STORY_TITLE_MAX_LENGTH}
              placeholder="กรอกชื่อเรื่องภาษาอื่น (ถ้ามี)"
              className="h-11 rounded-xl border-border bg-background px-3"
            />
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">
              ประเภทเนื้อหา <span className="text-destructive">*</span>
            </legend>
            <RadioGroup
              value={contentType}
              onValueChange={(value) => setContentType(value as WriterContentTab)}
              className="mt-2 grid gap-3 sm:grid-cols-2"
            >
              {contentTypes.map(({ value, label, description, icon: Icon }) => (
                <Label
                  key={value}
                  htmlFor={`content-type-${value}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                    contentType === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <RadioGroupItem
                    id={`content-type-${value}`}
                    value={value}
                    className="sr-only"
                  />
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.8} />
                  <span>
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:flex sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11 rounded-xl px-5 font-semibold">
                ยกเลิก
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!title.trim()}
              className="min-h-11 rounded-xl px-5 font-bold"
            >
              ดำเนินการต่อ
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
