import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { db } from '../src/db'

type ImportedChapter = {
  number: number
  title: string
  content: string
}

type ImportStoryMessage = {
  action: 'import_story'
  writerId: string
  primaryGenreId: string
  title: string
  folderId: string
  ageRating: number
  chapters: ImportedChapter[]
}

function slugForFolder(folderId: string) {
  return `drive-${createHash('sha256').update(folderId).digest('hex').slice(0, 18)}`
}

function wordCount(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length
}

async function importStory(message: ImportStoryMessage) {
  const slug = slugForFolder(message.folderId)
  const chapters = [...message.chapters].sort((left, right) => left.number - right.number)

  return db.begin(async (transaction) => {
    const [writer] = await transaction<{ id: string }[]>`
      SELECT id FROM users
      WHERE id = ${message.writerId}
        AND status = 'active'
        AND writer_status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `
    if (!writer) throw new Error('The selected writer is unavailable')

    const [genre] = await transaction<{ id: string }[]>`
      SELECT id FROM genres WHERE id = ${message.primaryGenreId} LIMIT 1
    `
    if (!genre) throw new Error('The selected genre is unavailable')

    const [existing] = await transaction<{ id: string }[]>`
      SELECT id FROM stories WHERE slug = ${slug} LIMIT 1
    `
    if (existing) return { status: 'skipped', story_id: existing.id, chapters: 0 }

    const [story] = await transaction<{ id: string }[]>`
      INSERT INTO stories (
        creator_user_id, type, title, slug, status, age_rating, primary_genre_id,
        moderation_status, published_at
      ) VALUES (
        ${message.writerId}, 'novel', ${message.title}, ${slug}, 'ongoing', ${message.ageRating},
        ${message.primaryGenreId}, 'active', NOW()
      )
      RETURNING id
    `

    const chapterNumbers = chapters.map((chapter) => chapter.number)
    const chapterTitles = chapters.map((chapter) => chapter.title)
    const chapterContents = chapters.map((chapter) => chapter.content)
    const insertedChapters = await transaction<{ id: string; chapter_number: string }[]>`
      INSERT INTO chapters (
        story_id, chapter_number, title, price, is_free, status, published_at
      )
      SELECT ${story.id}, imported.chapter_number, imported.title, 0, TRUE, 'published', NOW()
      FROM UNNEST(${chapterNumbers}::NUMERIC[], ${chapterTitles}::TEXT[]) AS imported(chapter_number, title)
      RETURNING id, chapter_number::TEXT
    `
    const chapterIdByNumber = new Map(insertedChapters.map((chapter) => [Number(chapter.chapter_number), chapter.id]))
    const chapterIds = chapters.map((chapter) => chapterIdByNumber.get(chapter.number)!)
    const chapterWordCounts = chapterContents.map(wordCount)
    await transaction`
      INSERT INTO novel_chapter_contents (chapter_id, content, word_count)
      SELECT imported.chapter_id, imported.content, imported.word_count
      FROM UNNEST(${chapterIds}::UUID[], ${chapterContents}::TEXT[], ${chapterWordCounts}::INTEGER[])
        AS imported(chapter_id, content, word_count)
    `

    return { status: 'imported', story_id: story.id, chapters: chapters.length }
  })
}

const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of reader) {
  if (!line.trim()) continue
  try {
    const message = JSON.parse(line) as ImportStoryMessage
    if (message.action !== 'import_story') throw new Error('Unknown import action')
    if (!message.title.trim() || !message.chapters.length) throw new Error('A story needs a title and chapters')
    process.stdout.write(`${JSON.stringify(await importStory(message))}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) })}\n`)
  }
}

await db.close()
