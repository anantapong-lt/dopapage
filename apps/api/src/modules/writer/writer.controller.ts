import { status } from 'elysia'
import {
  bulkUpdateChapterPrice,
  bulkUpdateChapterStatus,
  createWriterChapter,
  getWriterChapter,
  getWriterChapters,
  importWriterChaptersResponse as importWriterChaptersForOwner,
  importWriterMangaChaptersResponse as importWriterMangaChaptersForOwner,
  updateWriterChapter,
  WriterChapterError,
} from './chapter/writer-chapter.controller'
import {
  createWriterContent,
  CreateWriterContentError,
  deleteWriterContent,
  getMyContents,
  getWriterContent,
  updateWriterContent,
} from './content/writer-content.controller'
import { getWriterDashboardActivity, getWriterDashboardTopStories, getWriterStats, type WriterDashboardPeriod } from './writer.service'
import type {
  writerContentsQuerySchema,
  createWriterContentBodySchema,
  updateWriterContentBodySchema,
} from './content/writer-content.schema'
import type {
  importChaptersBodySchema,
  importMangaChaptersBodySchema,
  createWriterChapterBodySchema,
  updateWriterChapterBodySchema,
  writerChaptersQuerySchema,
  bulkUpdateChapterPriceBodySchema,
  bulkUpdateChapterStatusBodySchema,
} from './chapter/writer-chapter.schema'
import type { AuthenticatedUser } from '../auth/auth.service'
import { USER_ROLE } from '../../models/user.model'
import { resolveWriterContentAccess } from './writer-access.service'

type WriterContentActor = Pick<AuthenticatedUser, 'id' | 'role'>
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function importWriterChaptersResponse(
  currentUser: WriterContentActor,
  contentId: string,
  body: typeof importChaptersBodySchema.static,
) {
  const access = await resolveWriterContentAccess(currentUser, contentId)
  return importWriterChaptersForOwner(
    access.creatorUserId,
    contentId,
    body,
    access.canManageModeratedContent,
  )
}

export async function importWriterMangaChaptersResponse(
  currentUser: WriterContentActor,
  contentId: string,
  body: typeof importMangaChaptersBodySchema.static,
) {
  const access = await resolveWriterContentAccess(currentUser, contentId)
  return importWriterMangaChaptersForOwner(
    access.creatorUserId,
    contentId,
    body,
    access.canManageModeratedContent,
  )
}

export async function getWriterStatsResponse(
  currentUser: WriterContentActor,
  period: WriterDashboardPeriod = 'today',
  contentId?: string,
) {
  const userId = contentId
    ? (await resolveWriterContentAccess(currentUser, contentId)).creatorUserId
    : currentUser.id
  const [stats, activity, topStories] = await Promise.all([
    getWriterStats(userId),
    getWriterDashboardActivity(userId, period),
    getWriterDashboardTopStories(userId, period),
  ])
  return { stats, period, activity, top_stories: topStories }
}

export async function getWriterContentsResponse(
  currentUser: AuthenticatedUser | null,
  query: typeof writerContentsQuerySchema.static,
) {
  if (!currentUser) return status(401, { message: 'กรุณาเข้าสู่ระบบ' })
  if (currentUser.role !== USER_ROLE.WRITER) return status(403, { message: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' })

  return getMyContents(currentUser.id, {
    tab: query.tab,
    page: query.page ?? 1,
    limit: query.limit ?? 10,
    search: query.search?.trim() ?? '',
    genreIds: query.genre_ids?.split(',').filter((id) => UUID_PATTERN.test(id)) ?? [],
    status: query.status,
  })
}

export async function createWriterContentResponse(
  userId: string,
  body: typeof createWriterContentBodySchema.static,
) {
  try {
    const story = await createWriterContent(userId, body)
    return status(201, { story })
  } catch (error) {
    if (error instanceof CreateWriterContentError) {
      return status(error.statusCode, {
        message: error.message,
        field: error.field,
      })
    }

    console.error('Unable to create writer content', error)
    return status(500, { message: 'ไม่สามารถสร้างเนื้อหาได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function deleteWriterContentResponse(userId: string, contentId: string) {
  try {
    await deleteWriterContent(userId, contentId)
    return { success: true }
  } catch (error) {
    if (error instanceof CreateWriterContentError) {
      return status(error.statusCode, { message: error.message })
    }

    console.error('Unable to delete writer content', error)
    return status(500, { message: 'ไม่สามารถลบผลงานได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function getWriterContentResponse(
  currentUser: WriterContentActor,
  contentId: string,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    return {
      story: await getWriterContent(
        access.creatorUserId,
        contentId,
        access.canManageModeratedContent,
      ),
    }
  } catch (error) {
    if (error instanceof CreateWriterContentError) {
      return status(error.statusCode, {
        message: error.message,
        field: error.field,
      })
    }

    console.error('Unable to load writer content', error)
    return status(500, { message: 'ไม่สามารถโหลดเนื้อหาได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function createWriterChapterResponse(
  currentUser: WriterContentActor,
  contentId: string,
  body: typeof createWriterChapterBodySchema.static,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    const chapter = await createWriterChapter(
      access.creatorUserId,
      contentId,
      body,
      access.canManageModeratedContent,
    )
    return status(201, { chapter })
  } catch (error) {
    if (error instanceof WriterChapterError) {
      return status(error.statusCode, { message: error.message, field: error.field })
    }

    console.error('Unable to create writer chapter', error)
    return status(500, { message: 'ไม่สามารถสร้างตอนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function getWriterChapterResponse(
  currentUser: WriterContentActor,
  contentId: string,
  chapterId: string,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    return Response.json(
      {
        chapter: await getWriterChapter(
          access.creatorUserId,
          contentId,
          chapterId,
          access.canManageModeratedContent,
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof WriterChapterError) {
      return status(error.statusCode, { message: error.message, field: error.field })
    }

    console.error('Unable to load writer chapter', error)
    return status(500, { message: 'ไม่สามารถโหลดข้อมูลตอนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function updateWriterChapterResponse(
  currentUser: WriterContentActor,
  contentId: string,
  chapterId: string,
  body: typeof updateWriterChapterBodySchema.static,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    const chapter = await updateWriterChapter(
      access.creatorUserId,
      contentId,
      chapterId,
      body,
      access.canManageModeratedContent,
    )
    return { chapter }
  } catch (error) {
    if (error instanceof WriterChapterError) {
      return status(error.statusCode, { message: error.message, field: error.field })
    }

    console.error('Unable to update writer chapter', error)
    return status(500, { message: 'ไม่สามารถแก้ไขตอนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function updateWriterContentResponse(
  currentUser: WriterContentActor,
  contentId: string,
  body: typeof updateWriterContentBodySchema.static,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    const story = await updateWriterContent(
      access.creatorUserId,
      contentId,
      body,
      access.canManageModeratedContent,
    )
    return { story }
  } catch (error) {
    if (error instanceof CreateWriterContentError) {
      return status(error.statusCode, {
        message: error.message,
        field: error.field,
      })
    }

    console.error('Unable to update writer content', error)
    return status(500, { message: 'ไม่สามารถแก้ไขเนื้อหาได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function getWriterChaptersResponse(
  currentUser: WriterContentActor,
  contentId: string,
  query: typeof writerChaptersQuerySchema.static,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    return await getWriterChapters(access.creatorUserId, contentId, {
      search: query.search,
      sort: query.sort,
      page: query.page ?? 1,
      limit: query.limit ?? 10,
    }, access.canManageModeratedContent)
  } catch (error) {
    if (error instanceof WriterChapterError) {
      return status(error.statusCode, { message: error.message })
    }

    console.error('Unable to load writer chapters', error)
    return status(500, { message: 'ไม่สามารถโหลดรายการตอนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function bulkUpdateChapterPriceResponse(
  currentUser: WriterContentActor,
  contentId: string,
  body: typeof bulkUpdateChapterPriceBodySchema.static,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    const updatedCount = await bulkUpdateChapterPrice(access.creatorUserId, contentId, body)
    return { updated_count: updatedCount }
  } catch (error) {
    if (error instanceof WriterChapterError) {
      return status(error.statusCode, { message: error.message })
    }

    console.error('Unable to bulk update chapter price', error)
    return status(500, { message: 'ไม่สามารถอัปเดตราคาตอนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function bulkUpdateChapterStatusResponse(
  currentUser: WriterContentActor,
  contentId: string,
  body: typeof bulkUpdateChapterStatusBodySchema.static,
) {
  try {
    const access = await resolveWriterContentAccess(currentUser, contentId)
    const updatedCount = await bulkUpdateChapterStatus(access.creatorUserId, contentId, body)
    return { updated_count: updatedCount }
  } catch (error) {
    if (error instanceof WriterChapterError) {
      return status(error.statusCode, { message: error.message })
    }

    console.error('Unable to bulk update chapter status', error)
    return status(500, { message: 'ไม่สามารถอัปเดตสถานะตอนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}
