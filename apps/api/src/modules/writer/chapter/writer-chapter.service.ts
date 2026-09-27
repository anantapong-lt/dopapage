import { db } from '../../../db'
import type {
  CreatedWriterChapter,
  GetWriterChaptersInput,
  WriterChapter,
  WriterChapterCount,
  WriterChapterDetail,
  WriterChaptersResult,
} from '../../../models/writer-chapter.model'
import {
  CHAPTER_STATUS,
  MODERATION_STATUS,
  STORY_TYPE,
  type ChapterStatus,
  type StoryType,
} from '../../../models/story.model'
import type { UploadedChapterPage } from './writer-chapter-page.service'

export interface ChapterWriteInput {
  title: string
  chapterNumber: number
  price: number
  status: ChapterStatus
  publishedAt: string | null
  content: string
  wordCount: number
}

export async function insertImportedChapters(storyId: string, inputs: ChapterWriteInput[]) {
  return db.begin(async (transaction) => {
    await transaction`SELECT id FROM stories WHERE id = ${storyId} FOR UPDATE`
    const existing = await transaction<{ chapter_number: string }[]>`
      SELECT chapter_number::TEXT FROM chapters WHERE story_id = ${storyId}
    `
    const numbers = new Set(existing.map((row) => Number(row.chapter_number)))
    const errors = inputs.flatMap((input, index) => numbers.has(input.chapterNumber)
      ? [{ index, message: 'เลขตอนนี้มีอยู่ในผลงานแล้ว' }] : [])
    if (errors.length) return { created_count: 0, errors }
    for (const input of inputs) {
      const [chapter] = await transaction<{ id: string }[]>`
        INSERT INTO chapters (story_id, chapter_number, title, price, is_free, status, published_at)
        VALUES (${storyId}, ${input.chapterNumber}, ${input.title}, ROUND(${input.price}::NUMERIC, 2),
          ${input.price === 0}, ${input.status}, ${input.publishedAt}) RETURNING id
      `
      await transaction`
        INSERT INTO novel_chapter_contents (chapter_id, content, word_count)
        VALUES (${chapter.id}, ${input.content}, ${input.wordCount})
      `
    }
    await transaction`UPDATE stories SET updated_at = NOW() WHERE id = ${storyId}`
    return { created_count: inputs.length, errors: [] }
  })
}

export async function insertImportedMangaChapters(
  storyId: string,
  inputs: { input: ChapterWriteInput; pages: UploadedChapterPage[] }[],
) {
  return db.begin(async (transaction) => {
    await transaction`SELECT id FROM stories WHERE id = ${storyId} FOR UPDATE`
    const existing = await transaction<{ chapter_number: string }[]>`
      SELECT chapter_number::TEXT FROM chapters WHERE story_id = ${storyId}
    `
    const numbers = new Set(existing.map((row) => Number(row.chapter_number)))
    const errors = inputs.flatMap(({ input }, index) => numbers.has(input.chapterNumber)
      ? [{ index, message: 'เลขตอนนี้มีอยู่ในผลงานแล้ว' }] : [])
    if (errors.length) return { created_count: 0, errors }

    for (const { input, pages } of inputs) {
      const [chapter] = await transaction<{ id: string }[]>`
        INSERT INTO chapters (story_id, chapter_number, title, price, is_free, status, published_at)
        VALUES (${storyId}, ${input.chapterNumber}, ${input.title}, ROUND(${input.price}::NUMERIC, 2),
          ${input.price === 0}, ${input.status}, ${input.publishedAt}) RETURNING id
      `
      for (const [index, page] of pages.entries()) {
        await transaction`
          INSERT INTO manga_chapter_pages (chapter_id, page_number, image_key, width, height, alt_text)
          VALUES (${chapter.id}, ${index + 1}, ${page.key}, ${page.width}, ${page.height},
            ${`หน้า ${index + 1}: ${input.title}`})
        `
      }
    }
    await transaction`UPDATE stories SET updated_at = NOW() WHERE id = ${storyId}`
    return { created_count: inputs.length, errors: [] }
  })
}

export async function findOwnedStoryType(
  creatorUserId: string,
  storyId: string,
  includeLocked = false,
): Promise<StoryType | undefined> {
  const [story] = await db<{ type: StoryType }[]>`
    SELECT type FROM stories
    WHERE id = ${storyId} AND creator_user_id = ${creatorUserId} AND deleted_at IS NULL
      AND (${includeLocked} OR moderation_status <> ${MODERATION_STATUS.LOCKED})
    LIMIT 1
  `
  return story?.type
}

export async function findWriterChapter(
  storyId: string,
  chapterId: string,
  storyType: StoryType,
): Promise<WriterChapterDetail | undefined> {
  const [chapter] = await db<Omit<WriterChapterDetail, 'story_type' | 'content' | 'pages'>[]>`
    SELECT id, story_id, chapter_number::TEXT, title, price::TEXT, is_free,
      status, published_at
    FROM chapters
    WHERE id = ${chapterId} AND story_id = ${storyId}
    LIMIT 1
  `
  if (!chapter) return undefined

  if (storyType === STORY_TYPE.NOVEL) {
    const [novelContent] = await db<{ content: string }[]>`
      SELECT content FROM novel_chapter_contents WHERE chapter_id = ${chapterId}
    `
    return { ...chapter, story_type: storyType, content: novelContent?.content ?? '', pages: [] }
  }

  const pages = await db<WriterChapterDetail['pages']>`
    SELECT id, image_key, page_number, width, height
    FROM manga_chapter_pages
    WHERE chapter_id = ${chapterId}
    ORDER BY page_number
  `
  return { ...chapter, story_type: storyType, content: null, pages }
}

export async function queryWriterChapters(
  storyId: string,
  input: GetWriterChaptersInput,
): Promise<WriterChaptersResult> {
  const search = input.search?.trim() ?? ''
  const sort = input.sort ?? 'chapter_desc'
  const searchPattern = `%${search}%`
  const offset = (input.page - 1) * input.limit
  const [chapters, [count]] = await Promise.all([
    db<WriterChapter[]>`
      SELECT chapters.id, stories.slug AS story_slug, chapters.chapter_number::TEXT, chapters.title,
        chapters.price::TEXT, chapters.is_free,
        COUNT(chapter_purchases.id)::TEXT AS sales_count, chapters.status,
        chapters.published_at, chapters.created_at
      FROM chapters
      INNER JOIN stories ON stories.id = chapters.story_id
      LEFT JOIN chapter_purchases ON chapter_purchases.chapter_id = chapters.id
      WHERE chapters.story_id = ${storyId}
        AND (
          ${search} = '' OR chapters.chapter_number::TEXT ILIKE ${searchPattern}
          OR chapters.title ILIKE ${searchPattern}
        )
      GROUP BY chapters.id, stories.slug
      ORDER BY
        CASE WHEN ${sort} = 'chapter_asc' THEN chapters.chapter_number END ASC,
        CASE WHEN ${sort} = 'chapter_desc' THEN chapters.chapter_number END DESC,
        CASE WHEN ${sort} = 'created_asc' THEN chapters.created_at END ASC,
        CASE WHEN ${sort} = 'created_desc' THEN chapters.created_at END DESC,
        chapters.id DESC
      LIMIT ${input.limit} OFFSET ${offset}
    `,
    db<WriterChapterCount[]>`
      SELECT COUNT(*)::TEXT AS total
      FROM chapters
      WHERE story_id = ${storyId}
        AND (
          ${search} = '' OR chapter_number::TEXT ILIKE ${searchPattern}
          OR title ILIKE ${searchPattern}
        )
    `,
  ])
  const total = Number(count.total)
  return {
    chapters,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  }
}

export async function insertWriterChapter(
  storyId: string,
  storyType: StoryType,
  input: ChapterWriteInput,
  pages: UploadedChapterPage[],
): Promise<CreatedWriterChapter> {
  return db.begin(async (transaction) => {
    const [chapter] = await transaction<Omit<CreatedWriterChapter, 'story_type'>[]>`
      INSERT INTO chapters (
        story_id, chapter_number, title, price, is_free, status, published_at
      ) VALUES (
        ${storyId}, ${input.chapterNumber}, ${input.title}, ${input.price},
        ${input.price === 0}, ${input.status}, ${input.publishedAt}
      )
      RETURNING id, story_id, chapter_number::TEXT, title, price::TEXT,
        is_free, status, published_at, created_at
    `

    if (storyType === STORY_TYPE.NOVEL) {
      await transaction`
        INSERT INTO novel_chapter_contents (chapter_id, content, word_count)
        VALUES (${chapter.id}, ${input.content}, ${input.wordCount})
      `
    } else {
      for (const [index, page] of pages.entries()) {
        await transaction`
          INSERT INTO manga_chapter_pages (
            chapter_id, page_number, image_key, width, height, alt_text
          ) VALUES (
            ${chapter.id}, ${index + 1}, ${page.key}, ${page.width}, ${page.height},
            ${`หน้า ${index + 1}: ${input.title}`}
          )
        `
      }
    }
    await transaction`UPDATE stories SET updated_at = NOW() WHERE id = ${storyId}`
    return { ...chapter, story_type: storyType }
  })
}

export async function updateWriterChapterRecord(
  storyId: string,
  chapterId: string,
  storyType: StoryType,
  input: ChapterWriteInput,
  retainedPageIds: string[],
  removedPageIds: string[],
  uploadedPages: UploadedChapterPage[],
): Promise<CreatedWriterChapter> {
  return db.begin(async (transaction) => {
    const [chapter] = await transaction<Omit<CreatedWriterChapter, 'story_type'>[]>`
      UPDATE chapters
      SET chapter_number = ${input.chapterNumber}, title = ${input.title},
        price = ${input.price}, is_free = ${input.price === 0}, status = ${input.status},
        published_at = ${input.publishedAt}, updated_at = NOW()
      WHERE id = ${chapterId} AND story_id = ${storyId}
      RETURNING id, story_id, chapter_number::TEXT, title, price::TEXT,
        is_free, status, published_at, created_at
    `

    if (storyType === STORY_TYPE.NOVEL) {
      await transaction`
        UPDATE novel_chapter_contents
        SET content = ${input.content}, word_count = ${input.wordCount}, updated_at = NOW()
        WHERE chapter_id = ${chapterId}
      `
    } else {
      if (removedPageIds.length > 0) {
        const removedIds = db.array(removedPageIds, 'UUID')
        await transaction`
          DELETE FROM manga_chapter_pages
          WHERE chapter_id = ${chapterId} AND id = ANY(${removedIds})
        `
      }
      if (retainedPageIds.length > 0) {
        const retainedIds = db.array(retainedPageIds, 'UUID')
        await transaction`
          UPDATE manga_chapter_pages SET page_number = page_number + 1000, updated_at = NOW()
          WHERE chapter_id = ${chapterId} AND id = ANY(${retainedIds})
        `
      }
      for (const [index, pageId] of retainedPageIds.entries()) {
        await transaction`
          UPDATE manga_chapter_pages SET page_number = ${index + 1}, updated_at = NOW()
          WHERE chapter_id = ${chapterId} AND id = ${pageId}
        `
      }
      for (const [index, page] of uploadedPages.entries()) {
        const pageNumber = retainedPageIds.length + index + 1
        await transaction`
          INSERT INTO manga_chapter_pages (
            chapter_id, page_number, image_key, width, height, alt_text
          ) VALUES (
            ${chapterId}, ${pageNumber}, ${page.key}, ${page.width}, ${page.height},
            ${`หน้า ${pageNumber}: ${input.title}`}
          )
        `
      }
    }
    await transaction`UPDATE stories SET updated_at = NOW() WHERE id = ${storyId}`
    return { ...chapter, story_type: storyType }
  })
}

export async function countOwnedChapters(
  creatorUserId: string,
  storyId: string,
  chapterIds: string[],
): Promise<number> {
  const ids = db.array([...new Set(chapterIds)], 'UUID')
  const [result] = await db<{ total: string }[]>`
    SELECT COUNT(*)::TEXT AS total
    FROM chapters
    INNER JOIN stories ON stories.id = chapters.story_id
    WHERE chapters.story_id = ${storyId} AND chapters.id = ANY(${ids})
      AND stories.creator_user_id = ${creatorUserId} AND stories.deleted_at IS NULL
  `
  return Number(result.total)
}

export async function updateChapterPrices(
  storyId: string,
  chapterIds: string[],
  price: number,
): Promise<number> {
  const ids = db.array([...new Set(chapterIds)], 'UUID')
  const rows = await db<{ id: string }[]>`
    UPDATE chapters SET price = ${price}, is_free = ${price === 0}, updated_at = NOW()
    WHERE story_id = ${storyId} AND id = ANY(${ids}) RETURNING id
  `
  return rows.length
}

export async function updateChapterStatuses(
  storyId: string,
  chapterIds: string[],
  status: ChapterStatus,
  publishedAt: string | null,
): Promise<number> {
  const ids = db.array([...new Set(chapterIds)], 'UUID')
  const rows = await db<{ id: string }[]>`
    UPDATE chapters
    SET
      status = ${status},
      published_at = CASE
        WHEN ${status} = ${CHAPTER_STATUS.SCHEDULED} THEN ${publishedAt}
        WHEN ${status} = ${CHAPTER_STATUS.PUBLISHED} THEN COALESCE(published_at, NOW())
        ELSE published_at
      END,
      updated_at = NOW()
    WHERE story_id = ${storyId} AND id = ANY(${ids}) RETURNING id
  `
  return rows.length
}

export async function publishScheduledChapters(): Promise<number> {
  const chapters = await db<{ story_id: string }[]>`
    UPDATE chapters
    SET status = ${CHAPTER_STATUS.PUBLISHED}, updated_at = NOW()
    WHERE status = ${CHAPTER_STATUS.SCHEDULED}
      AND published_at IS NOT NULL
      AND published_at <= NOW()
    RETURNING story_id
  `

  if (chapters.length > 0) {
    const storyIds = db.array([...new Set(chapters.map((chapter) => chapter.story_id))], 'UUID')
    await db`UPDATE stories SET updated_at = NOW() WHERE id = ANY(${storyIds})`
  }

  return chapters.length
}
