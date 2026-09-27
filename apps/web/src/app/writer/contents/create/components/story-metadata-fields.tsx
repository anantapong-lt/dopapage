'use client'

import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  STORY_AGE_RATING_OPTIONS,
  STORY_STATUS_OPTIONS,
  STORY_TITLE_MAX_LENGTH,
  StoryStatus,
} from '@/constants/story.constant'
import { useCreateStoryForm } from './create-story-form'

interface StoryMetadataFieldsProps {
  initialAlternativeTitle?: string
  initialTitle: string
  initialStatus?: StoryStatus
  initialAgeRating?: string
  children: ReactNode
}

export function StoryMetadataFields({
  children,
  initialAlternativeTitle = '',
  initialAgeRating = '',
  initialStatus = StoryStatus.DRAFT,
  initialTitle,
}: StoryMetadataFieldsProps) {
  const { clearFieldError, errors } = useCreateStoryForm()
  const [title, setTitle] = useState(initialTitle)
  const [alternativeTitle, setAlternativeTitle] = useState(initialAlternativeTitle)
  const [status, setStatus] = useState<StoryStatus>(initialStatus)
  const [ageRating, setAgeRating] = useState(initialAgeRating)

  return (
    <>
      <div className="space-y-2 md:col-span-2" data-field="title">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="title" className="text-sm font-semibold">
            ชื่อเรื่อง <span className="text-destructive">*</span>
          </Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {title.length}/{STORY_TITLE_MAX_LENGTH}
          </span>
        </div>
        <Input
          id="title"
          type="text"
          name="title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            clearFieldError('title')
          }}
          maxLength={STORY_TITLE_MAX_LENGTH}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'title-error' : undefined}
          placeholder="กรอกชื่อเรื่อง"
          className="h-11 rounded-xl px-3"
        />
        {errors.title && (
          <p id="title-error" className="text-xs text-destructive">{errors.title}</p>
        )}
      </div>

      <div className="space-y-2 md:col-span-2" data-field="alternative_title">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="alternative-title" className="text-sm font-semibold">ชื่อเรื่องภาษาอื่น</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {alternativeTitle.length}/{STORY_TITLE_MAX_LENGTH}
          </span>
        </div>
        <Input
          id="alternative-title"
          type="text"
          name="alternative_title"
          value={alternativeTitle}
          onChange={(event) => {
            setAlternativeTitle(event.target.value)
            clearFieldError('alternative_title')
          }}
          maxLength={STORY_TITLE_MAX_LENGTH}
          aria-invalid={Boolean(errors.alternative_title)}
          aria-describedby={errors.alternative_title ? 'alternative-title-error' : undefined}
          placeholder="กรอกชื่อเรื่องภาษาอื่น (ถ้ามี)"
          className="h-11 rounded-xl px-3"
        />
        {errors.alternative_title && (
          <p id="alternative-title-error" className="text-xs text-destructive">{errors.alternative_title}</p>
        )}
      </div>

      {children}

      <div className="space-y-2" data-field="status">
        <Label htmlFor="status" className="text-sm font-semibold">
          สถานะ <span className="text-destructive">*</span>
        </Label>
        <Select
          name="status"
          value={status}
          onValueChange={(value) => {
            setStatus(value as StoryStatus)
            clearFieldError('status')
          }}
        >
          <SelectTrigger
            id="status"
            className="h-11! w-full rounded-xl px-3"
            aria-invalid={Boolean(errors.status)}
            aria-describedby={errors.status ? 'status-error' : undefined}
          >
            <SelectValue placeholder="เลือกสถานะ" />
          </SelectTrigger>
          <SelectContent>
            {STORY_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.status && (
          <p id="status-error" className="text-xs text-destructive">{errors.status}</p>
        )}
      </div>

      <div className="space-y-2" data-field="age_rating">
        <Label htmlFor="age-rating" className="text-sm font-semibold">
          เรทอายุ <span className="text-destructive">*</span>
        </Label>
        <input type="hidden" name="age_rating" value={ageRating} />
        <Select
          value={ageRating}
          onValueChange={(value) => {
            setAgeRating(value)
            clearFieldError('age_rating')
          }}
          required
        >
          <SelectTrigger
            id="age-rating"
            className="h-11! w-full rounded-xl px-3"
            aria-invalid={Boolean(errors.age_rating)}
            aria-describedby={errors.age_rating ? 'age-rating-error' : undefined}
          >
            <SelectValue placeholder="เลือกระดับเนื้อหา" />
          </SelectTrigger>
          <SelectContent>
            {STORY_AGE_RATING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.age_rating && (
          <p id="age-rating-error" className="text-xs text-destructive">{errors.age_rating}</p>
        )}
      </div>
    </>
  )
}
