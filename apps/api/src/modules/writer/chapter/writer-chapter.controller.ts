import type {
  BulkUpdateChapterPriceInput,
  BulkUpdateChapterStatusInput,
  CreatedWriterChapter,
  CreateWriterChapterInput,
  GetWriterChaptersInput,
  UpdateWriterChapterInput,
  WriterChaptersResult,
} from '../../../models/writer-chapter.model'
import { status } from 'elysia'
import type { importChaptersBodySchema, importMangaChaptersBodySchema } from './writer-chapter.schema'
import { insertImportedChapters, insertImportedMangaChapters } from './writer-chapter.service'

export async function importWriterChaptersResponse(
  userId: string,
  storyId: string,
  body: typeof importChaptersBodySchema.static,
  includeLocked = false,
) {
  try {
    const type = await requireOwnedStoryType(userId, storyId, includeLocked)
    if (type !== STORY_TYPE.NOVEL) throw new WriterChapterError('การนำเข้า TXT รองรับเฉพาะนิยาย', 400)
    if (body.chapters.reduce((total, row) => total + Buffer.byteLength(row.content, 'utf8'), 0) > 100 * 1024 * 1024) {
      throw new WriterChapterError('เนื้อหารวมหลังแตกไฟล์ต้องไม่เกิน 100MB', 400)
    }
    const errors: { index: number; message: string }[] = []
    const inputs: ChapterWriteInput[] = []
    const counts = new Map<number, number>()
    for (const row of body.chapters) {
      const number = Number(row.chapter_number)
      counts.set(number, (counts.get(number) ?? 0) + 1)
    }
    for (const [index, row] of body.chapters.entries()) {
      try {
        if (!/^\d+(\.\d)?$/.test(row.chapter_number)) throw new Error('กรุณาระบุเลขตอนที่ถูกต้อง ทศนิยมไม่เกิน 1 ตำแหน่ง')
        if ((counts.get(Number(row.chapter_number)) ?? 0) > 1) throw new Error('เลขตอนซ้ำกับรายการอื่นที่นำเข้า')
        if (row.price && !/^\d+(\.\d{1,2})?$/.test(row.price)) throw new Error('กรุณาระบุราคาที่ถูกต้อง ทศนิยมไม่เกิน 2 ตำแหน่ง')
        if (row.content.includes('\u0000')) throw new Error('เนื้อหามีอักขระที่ไม่รองรับ')
        const content = row.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\r\n?/g, '\n').split('\n').map((line) => `<p>${line || '<br>'}</p>`).join('')
        inputs.push(normalizeChapterInput(type, { ...row, chapter_number: Number(row.chapter_number), price: row.price ? Number(row.price) : 0, content }))
      } catch (error) {
        errors.push({ index, message: error instanceof Error ? error.message : 'ข้อมูลตอนไม่ถูกต้อง' })
      }
    }
    if (errors.length) return { created_count: 0, errors }
    try {
      return await insertImportedChapters(storyId, inputs)
    } catch (error) {
      if (isUniqueViolation(error)) return {
        created_count: 0,
        errors: inputs.map((_, index) => ({ index, message: 'มีเลขตอนซ้ำจากการบันทึกพร้อมกัน กรุณาตรวจสอบแล้วลองใหม่' })),
      }
      throw error
    }
  } catch (error) {
    if (error instanceof WriterChapterError) return status(error.statusCode, { message: error.message })
    console.error('Unable to import writer chapters', error)
    return status(500, { message: 'ไม่สามารถสร้างตอนได้ ยังไม่มีรายการถูกบันทึก กรุณาลองใหม่' })
  }
}

export async function importWriterMangaChaptersResponse(
  userId: string,
  storyId: string,
  body: typeof importMangaChaptersBodySchema.static,
  includeLocked = false,
) {
  const uploadedPages: UploadedChapterPage[] = []
  try {
    const type = await requireOwnedStoryType(userId, storyId, includeLocked)
    if (type !== STORY_TYPE.MANGA) throw new WriterChapterError('การนำเข้า ZIP รูปภาพรองรับเฉพาะการ์ตูน', 400)

    const parsed: unknown = body.chapters
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 500) {
      throw new WriterChapterError('ข้อมูลตอนที่นำเข้าไม่ถูกต้อง', 400)
    }
    const rows = parsed.map((row) => {
      if (!row || typeof row !== 'object') throw new WriterChapterError('ข้อมูลตอนที่นำเข้าไม่ถูกต้อง', 400)
      const value = row as Record<string, unknown>
      if (
        typeof value.title !== 'string'
        || typeof value.chapter_number !== 'string'
        || typeof value.price !== 'string'
        || typeof value.status !== 'string'
        || !Object.values(CHAPTER_STATUS).includes(value.status as typeof CHAPTER_STATUS[keyof typeof CHAPTER_STATUS])
        || typeof value.page_count !== 'number'
        || !Number.isInteger(value.page_count)
        || value.page_count < 1
        || value.page_count > 200
        || (value.published_at !== undefined && typeof value.published_at !== 'string')
      ) throw new WriterChapterError('ข้อมูลตอนที่นำเข้าไม่ถูกต้อง', 400)
      return {
        title: value.title,
        chapter_number: value.chapter_number,
        price: value.price,
        status: value.status as CreateWriterChapterInput['status'],
        page_count: value.page_count,
        published_at: value.published_at as string | undefined,
      }
    })
    const expectedPageCount = rows.reduce((total, row) => total + row.page_count, 0)
    if (body.images.length !== expectedPageCount) throw new WriterChapterError('จำนวนรูปภาพไม่ตรงกับข้อมูลตอน', 400)

    const errors: { index: number; message: string }[] = []
    const inputs: ChapterWriteInput[] = []
    const counts = new Map<number, number>()
    for (const row of rows) counts.set(Number(row.chapter_number), (counts.get(Number(row.chapter_number)) ?? 0) + 1)
    for (const [index, row] of rows.entries()) {
      try {
        if (!/^\d+(\.\d)?$/.test(row.chapter_number)) throw new Error('กรุณาระบุเลขตอนที่ถูกต้อง ทศนิยมไม่เกิน 1 ตำแหน่ง')
        if ((counts.get(Number(row.chapter_number)) ?? 0) > 1) throw new Error('เลขตอนซ้ำกับรายการอื่นที่นำเข้า')
        if (row.price && !/^\d+(\.\d{1,2})?$/.test(row.price)) throw new Error('กรุณาระบุราคาที่ถูกต้อง ทศนิยมไม่เกิน 2 ตำแหน่ง')
        inputs.push(normalizeChapterInput(type, {
          title: row.title, chapter_number: Number(row.chapter_number), price: row.price ? Number(row.price) : 0,
          status: row.status, published_at: row.published_at,
        }))
      } catch (error) {
        errors.push({ index, message: error instanceof Error ? error.message : 'ข้อมูลตอนไม่ถูกต้อง' })
      }
    }
    if (errors.length) return { created_count: 0, errors }

    let offset = 0
    const entries = []
    for (const [index, input] of inputs.entries()) {
      const files = body.images.slice(offset, offset + rows[index].page_count)
      offset += files.length
      const pages: UploadedChapterPage[] = []
      for (const image of files) {
        const page = await uploadWriterChapterPage(image, storyId, input.chapterNumber)
        uploadedPages.push(page)
        pages.push(page)
      }
      entries.push({ input, pages })
    }
    const result = await insertImportedMangaChapters(storyId, entries)
    if (result.errors.length) await cleanupUploadedPages(uploadedPages)
    return result
  } catch (error) {
    await cleanupUploadedPages(uploadedPages)
    if (error instanceof WriterChapterError) return status(error.statusCode, { message: error.message })
    console.error('Unable to import writer manga chapters', error)
    return status(500, { message: 'ไม่สามารถสร้างตอนได้ ยังไม่มีรายการถูกบันทึก กรุณาลองใหม่' })
  }
}
import { CHAPTER_STATUS, STORY_TYPE, type StoryType } from '../../../models/story.model'
import {
  createWriterChapterPageSignedUrl,
  deleteWriterChapterPage,
  uploadWriterChapterPage,
  type UploadedChapterPage,
} from './writer-chapter-page.service'
import {
  countOwnedChapters,
  findOwnedStoryType,
  findWriterChapter,
  insertWriterChapter,
  queryWriterChapters,
  updateChapterPrices,
  updateChapterStatuses,
  updateWriterChapterRecord,
  type ChapterWriteInput,
} from './writer-chapter.service'

export class WriterChapterError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 | 409,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'WriterChapterError'
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const postgresError = error as Record<string, unknown>
  return postgresError.code === '23505' || postgresError.errno === '23505'
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|ensp|emsp|thinsp|#160|#xA0);/gi, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function countWords(text: string): number {
  let count = 0
  for (const part of new Intl.Segmenter('th', { granularity: 'word' }).segment(text)) {
    if (part.isWordLike) count++
  }
  return count
}

const SAFE_NOVEL_TAGS = new Set([
  'blockquote', 'br', 'code', 'del', 'em', 'h2', 'h3', 'hr', 'li', 'ol',
  'p', 'pre', 's', 'span', 'strong', 'u', 'ul', 'img',
])
const SAFE_NOVEL_STYLE_PROPERTIES = new Set([
  'background-color', 'color', 'font-family', 'font-size', 'font-style',
  'font-weight', 'letter-spacing', 'line-height', 'margin-bottom', 'margin-left',
  'margin-right', 'margin-top', 'text-align', 'text-decoration', 'text-indent',
])

function sanitizeNovelStyle(value: string): string {
  return value.split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator === -1) return []

    const property = declaration.slice(0, separator).trim().toLowerCase()
    const propertyValue = declaration.slice(separator + 1).trim()
    if (
      !SAFE_NOVEL_STYLE_PROPERTIES.has(property)
      || !propertyValue
      || propertyValue.length > 200
      || /(?:@import|behavior|expression|javascript|[-]moz-binding|url)\s*\(/i.test(propertyValue)
      || /[<>\u0000]/.test(propertyValue)
    ) return []

    return [`${property}: ${propertyValue}`]
  }).join('; ')
}

function sanitizeNovelHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form|svg|math|audio|video|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, (tag) => {
      const match = /^<\s*(\/?)\s*([a-z0-9]+)\b([^>]*)>$/i.exec(tag)
      if (!match) return ''

      const [, closing, rawName, attributes] = match
      const name = rawName.toLowerCase()
      if (!SAFE_NOVEL_TAGS.has(name)) return ''
      if (closing) return name === 'img' ? '' : `</${name}>`

      if (name === 'img') {
        const sourceMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes)
        const source = sourceMatch?.[1] ?? sourceMatch?.[2] ?? ''
        if (!isSafeNovelImageSource(source)) return ''

        const altMatch = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes)
        const alt = (altMatch?.[1] ?? altMatch?.[2] ?? '').slice(0, 255)
        const widthMatch = /\bdata-image-display-width\s*=\s*(?:"(\d{2,4})"|'(\d{2,4})'|(\d{2,4}))(?=\s|$)/i.exec(attributes)
        const parsedWidth = Number(widthMatch?.[1] ?? widthMatch?.[2] ?? widthMatch?.[3])
        const displayWidth = Number.isInteger(parsedWidth) && parsedWidth >= 48 && parsedWidth <= 5000
          ? parsedWidth
          : null
        const alignMatch = /\bdata-image-align\s*=\s*(?:"(left|center|right)"|'(left|center|right)'|(left|center|right))(?=\s|$)/i.exec(attributes)
        const align = (alignMatch?.[1] ?? alignMatch?.[2] ?? alignMatch?.[3] ?? 'center').toLowerCase()
        return `<img src="${escapeHtmlAttribute(source)}" alt="${escapeHtmlAttribute(alt)}"${displayWidth ? ` data-image-display-width="${displayWidth}"` : ''} data-image-align="${align}">`
      }

      const safeAttributes: string[] = []
      const styleMatch = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes)
      const style = sanitizeNovelStyle(styleMatch?.[1] ?? styleMatch?.[2] ?? styleMatch?.[3] ?? '')
      if (style) safeAttributes.push(`style="${style.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)

      if (name === 'span' && /\bdata-type\s*=\s*(?:"paragraph"|'paragraph'|paragraph)(?=\s|$)/i.test(attributes)) {
        safeAttributes.push('data-type="paragraph"')
      }
      const direction = /\bdir\s*=\s*(?:"(ltr|rtl|auto)"|'(ltr|rtl|auto)'|(ltr|rtl|auto))(?=\s|$)/i.exec(attributes)
      const directionValue = direction?.[1] ?? direction?.[2] ?? direction?.[3]
      if (directionValue) {
        safeAttributes.push(`dir="${directionValue.toLowerCase()}"`)
      }
      if (name === 'ol') {
        const start = /\bstart\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))(?=\s|$)/i.exec(attributes)
        if (start) safeAttributes.push(`start="${start[1] ?? start[2] ?? start[3]}"`)
      }

      return `<${name}${safeAttributes.length ? ` ${safeAttributes.join(' ')}` : ''}>`
    })
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isSafeNovelImageSource(value: string): boolean {
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value)
  if (!match) return false
  const encoded = match[2].replace(/\s/g, '')
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  const estimatedSize = Math.floor(encoded.length * 3 / 4) - padding
  if (!encoded.length || encoded.length % 4 !== 0 || estimatedSize > 5 * 1024 * 1024) return false

  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length !== estimatedSize) return false
  const type = match[1].toLowerCase()
  if (type === 'jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'png') {
    return bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
}

function validateNovelImages(html: string): void {
  const imageTags = Array.from(html.matchAll(/<img\b[^>]*>/gi), ([tag]) => tag)
  if (imageTags.length > 4) {
    throw new WriterChapterError('รูปภาพประกอบต้องไม่เกิน 4 รูปต่อตอน', 400, 'content')
  }

  for (const tag of imageTags) {
    const sourceMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const source = sourceMatch?.[1] ?? sourceMatch?.[2] ?? ''
    if (!isSafeNovelImageSource(source)) {
      throw new WriterChapterError('รองรับเฉพาะรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB ต่อรูป', 400, 'content')
    }
  }
}

async function requireOwnedStoryType(creatorUserId: string, storyId: string, includeLocked = false) {
  const storyType = await findOwnedStoryType(creatorUserId, storyId, includeLocked)
  if (!storyType) throw new WriterChapterError('ไม่พบผลงานที่ต้องการจัดการ', 404)
  return storyType
}

function normalizeChapterInput(
  storyType: StoryType,
  input: CreateWriterChapterInput,
  existingPublishedAt?: Date | null,
): ChapterWriteInput {
  const title = input.title.trim()
  const chapterNumber = Number(input.chapter_number)
  const price = input.price ?? 0
  if (storyType === STORY_TYPE.NOVEL) validateNovelImages(input.content?.trim() ?? '')
  const content = storyType === STORY_TYPE.NOVEL
    ? sanitizeNovelHtml(input.content?.trim() ?? '')
    : input.content?.trim() ?? ''

  if (!Number.isFinite(chapterNumber) || chapterNumber < 0 || chapterNumber > 99_999_999.9 || !Number.isInteger(chapterNumber * 10)) {
    throw new WriterChapterError('เลขตอนต้องเป็นตัวเลขตั้งแต่ 0 ถึง 99,999,999.9 และมีทศนิยมไม่เกิน 1 ตำแหน่ง', 400, 'chapter_number')
  }
  if (!Number.isFinite(price) || price < 0 || price > 9_999_999_999.99) {
    throw new WriterChapterError('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ถึง 9,999,999,999.99', 400, 'price')
  }

  let publishedAt = existingPublishedAt?.toISOString() ?? null
  if (input.status === CHAPTER_STATUS.SCHEDULED) {
    const scheduledAt = input.published_at ? new Date(input.published_at) : null
    const isExistingScheduledAt = Boolean(
      scheduledAt
      && existingPublishedAt
      && scheduledAt.getTime() === existingPublishedAt.getTime(),
    )
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || (!isExistingScheduledAt && scheduledAt <= new Date())) {
      throw new WriterChapterError('กรุณาระบุเวลาเผยแพร่ในอนาคต', 400, 'published_at')
    }
    publishedAt = scheduledAt.toISOString()
  } else if (input.status === CHAPTER_STATUS.PUBLISHED && !publishedAt) {
    publishedAt = new Date().toISOString()
  }

  const plainContent = plainTextFromHtml(content)
  if (storyType === STORY_TYPE.NOVEL && !plainContent) {
    throw new WriterChapterError('กรุณากรอกเนื้อหาตอน', 400, 'content')
  }

  return {
    title,
    chapterNumber,
    price,
    status: input.status,
    publishedAt,
    content,
    wordCount: countWords(plainContent),
  }
}

function parseRetainedPageIds(value?: string[]): string[] {
  if (!value) return []
  if (value.some((id) => typeof id !== 'string')) {
    throw new WriterChapterError('ข้อมูลรูปภาพเดิมไม่ถูกต้อง', 400, 'images')
  }
  return [...new Set(value)]
}

async function cleanupUploadedPages(pages: UploadedChapterPage[]) {
  const results = await Promise.allSettled(
    pages.map((page) => deleteWriterChapterPage(page.key)),
  )
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Unable to remove orphaned writer chapter page', result.reason)
    }
  }
}

export async function getWriterChapter(
  creatorUserId: string,
  storyId: string,
  chapterId: string,
  includeLocked = false,
) {
  const storyType = await requireOwnedStoryType(creatorUserId, storyId, includeLocked)
  const chapter = await findWriterChapter(storyId, chapterId, storyType)
  if (!chapter) throw new WriterChapterError('ไม่พบตอนที่ต้องการแก้ไข', 404)
  return {
    ...chapter,
    pages: chapter.pages.map(({ image_key, ...page }) => ({
      ...page,
      image_url: createWriterChapterPageSignedUrl(image_key),
    })),
  }
}

export async function getWriterChapters(
  creatorUserId: string,
  storyId: string,
  input: GetWriterChaptersInput,
  includeLocked = false,
): Promise<WriterChaptersResult> {
  await requireOwnedStoryType(creatorUserId, storyId, includeLocked)
  return queryWriterChapters(storyId, input)
}

export async function createWriterChapter(
  creatorUserId: string,
  storyId: string,
  input: CreateWriterChapterInput,
  includeLocked = false,
): Promise<CreatedWriterChapter> {
  const storyType = await requireOwnedStoryType(creatorUserId, storyId, includeLocked)
  const uploadedPages: UploadedChapterPage[] = []
  try {
    const writeInput = normalizeChapterInput(storyType, input)
    const images = storyType === STORY_TYPE.MANGA ? input.images ?? [] : []
    if (storyType === STORY_TYPE.MANGA && images.length === 0) {
      throw new WriterChapterError('กรุณาเพิ่มรูปภาพอย่างน้อย 1 รูป', 400, 'images')
    }

    for (const image of images) {
      uploadedPages.push(
        await uploadWriterChapterPage(image, storyId, writeInput.chapterNumber),
      )
    }
    return await insertWriterChapter(storyId, storyType, writeInput, uploadedPages)
  } catch (error) {
    await cleanupUploadedPages(uploadedPages)
    if (isUniqueViolation(error)) {
      throw new WriterChapterError('เลขตอนนี้ถูกใช้งานแล้ว', 409, 'chapter_number')
    }
    throw error
  }
}

export async function updateWriterChapter(
  creatorUserId: string,
  storyId: string,
  chapterId: string,
  input: UpdateWriterChapterInput,
  includeLocked = false,
): Promise<CreatedWriterChapter> {
  const storyType = await requireOwnedStoryType(creatorUserId, storyId, includeLocked)
  const existing = await findWriterChapter(storyId, chapterId, storyType)
  if (!existing) throw new WriterChapterError('ไม่พบตอนที่ต้องการแก้ไข', 404)
  const uploadedPages: UploadedChapterPage[] = []
  try {
    const writeInput = normalizeChapterInput(existing.story_type, input, existing.published_at)
    const images = existing.story_type === STORY_TYPE.MANGA ? input.images ?? [] : []
    const retainedPageIds = existing.story_type === STORY_TYPE.MANGA
      ? parseRetainedPageIds(input.retained_page_ids)
      : []
    const existingPageIds = new Set(existing.pages.map((page) => page.id))
    if (retainedPageIds.some((id) => !existingPageIds.has(id))) {
      throw new WriterChapterError('ไม่พบรูปภาพเดิมบางรายการ', 400, 'images')
    }
    if (existing.story_type === STORY_TYPE.MANGA && retainedPageIds.length + images.length === 0) {
      throw new WriterChapterError('กรุณาเพิ่มรูปภาพอย่างน้อย 1 รูป', 400, 'images')
    }
    if (retainedPageIds.length + images.length > 200) {
      throw new WriterChapterError('รูปภาพต้องไม่เกิน 200 รูป', 400, 'images')
    }

    const removedPages = existing.pages.filter((page) => !retainedPageIds.includes(page.id))
    for (const image of images) {
      uploadedPages.push(
        await uploadWriterChapterPage(image, storyId, writeInput.chapterNumber),
      )
    }
    const chapter = await updateWriterChapterRecord(
      storyId,
      chapterId,
      existing.story_type,
      writeInput,
      retainedPageIds,
      removedPages.map((page) => page.id),
      uploadedPages,
    )

    const deletionResults = await Promise.allSettled(
      removedPages.map((page) => deleteWriterChapterPage(page.image_key)),
    )
    for (const result of deletionResults) {
      if (result.status === 'rejected') {
        console.error('Unable to remove deleted writer chapter page', result.reason)
      }
    }
    return chapter
  } catch (error) {
    await cleanupUploadedPages(uploadedPages)
    if (isUniqueViolation(error)) {
      throw new WriterChapterError('เลขตอนนี้ถูกใช้งานแล้ว', 409, 'chapter_number')
    }
    throw error
  }
}

async function assertSelectedChapters(
  creatorUserId: string,
  storyId: string,
  chapterIds: string[],
) {
  const uniqueIds = [...new Set(chapterIds)]
  const count = await countOwnedChapters(creatorUserId, storyId, uniqueIds)
  if (count !== uniqueIds.length) {
    throw new WriterChapterError('ไม่พบตอนที่เลือกบางรายการ', 404)
  }
}

export async function bulkUpdateChapterPrice(
  creatorUserId: string,
  storyId: string,
  input: BulkUpdateChapterPriceInput,
): Promise<number> {
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new WriterChapterError('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป', 400)
  }
  await assertSelectedChapters(creatorUserId, storyId, input.chapter_ids)
  return updateChapterPrices(storyId, input.chapter_ids, input.price)
}

export async function bulkUpdateChapterStatus(
  creatorUserId: string,
  storyId: string,
  input: BulkUpdateChapterStatusInput,
): Promise<number> {
  let scheduledAt: string | null = null
  if (input.status === CHAPTER_STATUS.SCHEDULED) {
    const scheduledDate = input.published_at ? new Date(input.published_at) : null
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      throw new WriterChapterError('กรุณาระบุเวลาเผยแพร่ในอนาคต', 400)
    }
    scheduledAt = scheduledDate.toISOString()
  }
  await assertSelectedChapters(creatorUserId, storyId, input.chapter_ids)
  return updateChapterStatuses(storyId, input.chapter_ids, input.status, scheduledAt)
}
