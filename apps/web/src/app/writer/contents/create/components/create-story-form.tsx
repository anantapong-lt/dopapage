'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { createWriterContent, updateWriterContent } from '@/controllers/writer.controller'
import { userRole } from '@/interface/user.interface'
import { ApiError } from '@/lib/api-client'
import { createStorySchema } from '../create-story.schema'

interface CreateStoryFormContextValue {
  errors: Record<string, string>
  clearFieldError: (name: string) => void
}

const CreateStoryFormContext = createContext<CreateStoryFormContextValue | null>(null)

function getFormData(form: HTMLFormElement): FormData {
  const body = new FormData(form)
  const cover = body.get('cover')
  if (cover instanceof File && cover.size === 0) body.delete('cover')
  return body
}

function getFormSnapshot(form: HTMLFormElement): string {
  return JSON.stringify(Array.from(getFormData(form).entries()).map(([name, value]) => (
    value instanceof File
      ? [name, value.name, value.size, value.type, value.lastModified]
      : [name, value]
  )))
}

interface CreateStoryFormProps {
  cancelHref: string
  contentId?: string
  children: ReactNode | ((slots: { actions: ReactNode }) => ReactNode)
}

export function CreateStoryForm({ cancelHref, children, contentId }: CreateStoryFormProps) {
  const router = useRouter()
  const { accessToken, user } = useAuth()
  const formRef = useRef<HTMLFormElement>(null)
  const initialSnapshotRef = useRef<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isFormValid, setIsFormValid] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isSlotChildren = typeof children === 'function'
  const actionBarClassName = isSlotChildren
    ? 'grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center md:col-span-2'
    : 'grid grid-cols-2 gap-3 border-t border-border pt-5 sm:flex sm:flex-wrap sm:items-center sm:justify-center lg:col-span-2'

  const updateFormState = useCallback(() => {
    const form = formRef.current
    if (!form) return

    const body = getFormData(form)
    setIsFormValid(createStorySchema.safeParse(Object.fromEntries(body.entries())).success)
    setIsDirty(
      initialSnapshotRef.current !== null
      && getFormSnapshot(form) !== initialSnapshotRef.current,
    )
  }, [])

  const scheduleFormStateUpdate = useCallback(() => {
    window.requestAnimationFrame(updateFormState)
  }, [updateFormState])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const form = formRef.current
      if (!form) return

      initialSnapshotRef.current = getFormSnapshot(form)
      updateFormState()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [updateFormState])

  const clearFieldError = useCallback((name: string) => {
    if (contentId) setIsSaved(false)
    scheduleFormStateUpdate()
    setErrors((currentErrors) => {
      if (!currentErrors[name]) return currentErrors

      const nextErrors = { ...currentErrors }
      delete nextErrors[name]
      return nextErrors
    })
  }, [contentId, scheduleFormStateUpdate])

  const contextValue = useMemo(() => ({ errors, clearFieldError }), [clearFieldError, errors])

  const scrollToFirstError = (form: HTMLFormElement, fieldName: string) => {
    window.requestAnimationFrame(() => {
      const field = form.querySelector<HTMLElement>(`[data-field="${fieldName}"]`)
      if (!field) return

      field.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button')
        ?.focus({ preventScroll: true })
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting || isSaved) return

    const form = event.currentTarget
    const body = getFormData(form)
    const validation = createStorySchema.safeParse(Object.fromEntries(body.entries()))

    if (!validation.success) {
      setIsFormValid(false)
      const nextErrors: Record<string, string> = {}
      for (const issue of validation.error.issues) {
        const fieldName = String(issue.path[0] ?? '')
        if (fieldName && !nextErrors[fieldName]) nextErrors[fieldName] = issue.message
      }

      setErrors(nextErrors)
      const firstFieldName = Object.keys(nextErrors)[0]
      if (firstFieldName) scrollToFirstError(form, firstFieldName)
      return
    }

    if (!accessToken) {
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      let savedContentId = contentId
      if (contentId) {
        await updateWriterContent(contentId, body, accessToken)
      } else {
        const { story } = await createWriterContent(body, accessToken)
        savedContentId = story.id
      }
      setIsSaved(true)
      initialSnapshotRef.current = getFormSnapshot(form)
      setIsDirty(false)
      toast.success(contentId ? 'แก้ไขเนื้อหาเรียบร้อยแล้ว' : 'บันทึกเนื้อหาเรียบร้อยแล้ว')
      if (contentId && user?.role === userRole.SUPER_ADMIN) return
      router.push(
        contentId
          ? '/writer/contents?tab=novel'
          : `/writer/content/${savedContentId}/content`,
      )
    } catch (error) {
      if (error instanceof ApiError && error.field) {
        setErrors({ [error.field]: error.message })
        toast.error(error.message)
        scrollToFirstError(form, error.field)
        return
      }

    } finally {
      setIsSubmitting(false)
    }
  }

  const actionBar = (
    <div className={actionBarClassName}>
      <Link
        href={cancelHref}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold transition-colors hover:bg-accent"
      >
        ยกเลิก
      </Link>
      <button
        type="submit"
        disabled={isSubmitting || isSaved || !isFormValid || (Boolean(contentId) && !isDirty)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting && <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />}
        {isSubmitting
          ? 'กำลังบันทึก...'
          : isSaved
            ? 'บันทึกแล้ว'
            : 'บันทึก'}
      </button>
    </div>
  )

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={scheduleFormStateUpdate}
      noValidate
      className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)] lg:items-start"
    >
      <CreateStoryFormContext.Provider value={contextValue}>
        {isSlotChildren ? children({ actions: actionBar }) : children}
      </CreateStoryFormContext.Provider>

      {!isSlotChildren && actionBar}
    </form>
  )
}

export function useCreateStoryForm() {
  const context = useContext(CreateStoryFormContext)
  if (!context) throw new Error('useCreateStoryForm must be used inside CreateStoryForm')
  return context
}
