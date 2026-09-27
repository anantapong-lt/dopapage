import { apiRequest } from '@/lib/api-client'
import type { ImportedChapter, ChapterImportResult } from '@/interface/writer-chapter-import.interface'

export function importWriterChapters(contentId: string, rows: ImportedChapter[], accessToken: string): Promise<ChapterImportResult> {
  return apiRequest(`/writer/contents/${contentId}/chapters/import-novels`, {
    method: 'POST', accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapters: rows.map((row) => ({
      title: row.title, chapter_number: row.chapter_number, price: row.price,
      status: row.status, content: row.content,
      ...(row.status === 'scheduled' ? { published_at: new Date(row.published_at).toISOString() } : {}),
    })) }),
  })
}

export function importWriterMangaChapters(contentId: string, rows: ImportedChapter[], accessToken: string): Promise<ChapterImportResult> {
  const body = new FormData()
  body.set('chapters', JSON.stringify(rows.map((row) => ({
    title: row.title, chapter_number: row.chapter_number, price: row.price,
    status: row.status, page_count: row.images?.length ?? 0,
    ...(row.status === 'scheduled' ? { published_at: new Date(row.published_at).toISOString() } : {}),
  }))))
  for (const row of rows) for (const image of row.images ?? []) body.append('images', image)
  return apiRequest(`/writer/contents/${contentId}/chapters/import-manga`, {
    method: 'POST', accessToken, body,
  })
}
import type { WriterPurchasesResponse } from '@/interface/writer-purchase.interface'
import type { OverviewPeriod, WriterOverview } from '@/interface/writer-overview.interface'
import type { StoryType } from '@/constants/story.constant'
import type {
  WriterContentDetail,
  WriterContentTab,
  WriterContentsResponse,
} from '@/interface/writer-content.interface'
import type { WriterDashboardData, WriterDashboardPeriod } from '@/interface/writer-stats.interface'
import type { BankConfig, WriterBankAccount, WriterBankAccountInput } from '@/interface/writer-bank-account.interface'
import type { CreateWriterWithdrawalResponse, WriterWithdrawalsResponse } from '@/interface/writer-withdrawal.interface'
import type {
  ChapterStatus,
  CreatedWriterChapter,
  WriterChapterDetail,
  WriterChaptersResponse,
} from '@/interface/writer-chapter.interface'

export function getBankConfigs(accessToken: string): Promise<{ banks: BankConfig[] }> {
  return apiRequest('/writer/banks', { accessToken, cache: 'no-store' })
}

export function getWriterBankAccount(accessToken: string): Promise<{ account: WriterBankAccount | null }> {
  return apiRequest('/writer/bank-account', { accessToken, cache: 'no-store' })
}

export function getWriterApplicationStatus(accessToken: string): Promise<{ status: WriterBankAccount['application_status'] | null }> {
  return apiRequest('/writer/application-status', { accessToken, cache: 'no-store' })
}

export function submitWriterBankAccount(
  body: WriterBankAccountInput,
  accessToken: string,
): Promise<{ account: WriterBankAccount }> {
  return apiRequest('/writer/bank-account', {
    method: 'POST', accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function getWriterWithdrawals(
  page: number,
  limit: number,
  accessToken: string,
): Promise<WriterWithdrawalsResponse> {
  return apiRequest(`/writer/withdrawals?page=${page}&limit=${limit}`, {
    accessToken,
    cache: 'no-store',
  })
}

export function createWriterWithdrawal(
  amount: string,
  accessToken: string,
): Promise<CreateWriterWithdrawalResponse> {
  return apiRequest('/writer/withdrawals', {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  })
}

export function getWriterOverview(
  contentId: string,
  period: OverviewPeriod,
  accessToken: string,
  signal?: AbortSignal,
): Promise<WriterOverview> {
  return apiRequest(`/writer/contents/${contentId}/overview?period=${period}`, {
    accessToken,
    signal,
    cache: 'no-store',
  })
}

export function getWriterPurchases(
  page: number,
  limit: number,
  accessToken: string,
  signal?: AbortSignal,
  search?: string,
): Promise<WriterPurchasesResponse> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (search) query.set('search', search)
  return apiRequest(`/writer/purchases?${query}`, {
    accessToken,
    signal,
    cache: 'no-store',
  })
}

export function getWriterStats(
  period: WriterDashboardPeriod,
  accessToken: string,
  contentId?: string,
): Promise<WriterDashboardData> {
  const query = new URLSearchParams({ period })
  if (contentId) query.set('content_id', contentId)
  return apiRequest<WriterDashboardData>(`/writer/stats?${query}`, {
    accessToken,
  })
}

export function getMyContents(
  tab: WriterContentTab,
  page: number,
  limit: number,
  accessToken: string,
): Promise<WriterContentsResponse> {
  const searchParams = new URLSearchParams({
    tab,
    page: String(page),
    limit: String(limit),
  })

  return apiRequest(`/writer/contents?${searchParams.toString()}`, {
    accessToken,
  })
}

export function createWriterContent(
  body: FormData,
  accessToken: string,
): Promise<{
  story: {
    id: string
    type: StoryType
    slug: string
    cover_url: string | null
    cover_blur_data_url: string | null
  }
}> {
  return apiRequest('/writer/contents', {
    method: 'POST',
    accessToken,
    body,
  })
}

export function getWriterContent(
  contentId: string,
  accessToken: string,
): Promise<{ story: WriterContentDetail }> {
  return apiRequest(`/writer/contents/${contentId}`, {
    accessToken,
  })
}

export function deleteWriterContent(
  contentId: string,
  accessToken: string,
): Promise<{ success: boolean }> {
  return apiRequest(`/writer/contents/${contentId}`, {
    method: 'DELETE',
    accessToken,
  })
}

export function updateWriterContent(
  contentId: string,
  body: FormData,
  accessToken: string,
): Promise<{
  story: {
    id: string
    type: StoryType
    slug: string
    cover_url: string | null
    cover_blur_data_url: string | null
  }
}> {
  return apiRequest(`/writer/contents/${contentId}`, {
    method: 'PATCH',
    accessToken,
    body,
  })
}

export function getWriterChapters(
  contentId: string,
  search: string,
  sort: 'chapter_desc' | 'chapter_asc' | 'sales_desc' | 'sales_asc' | 'created_desc' | 'created_asc',
  page: number,
  limit: number,
  accessToken: string,
): Promise<WriterChaptersResponse> {
  const searchParams = new URLSearchParams({
    search,
    sort,
    page: String(page),
    limit: String(limit),
  })

  return apiRequest(`/writer/contents/${contentId}/chapters?${searchParams.toString()}`, {
    accessToken,
  })
}

export function createWriterChapter(
  contentId: string,
  body: FormData,
  accessToken: string,
): Promise<{ chapter: CreatedWriterChapter }> {
  return apiRequest(`/writer/contents/${contentId}/chapters`, {
    method: 'POST',
    accessToken,
    body,
  })
}

export function getWriterChapter(
  contentId: string,
  chapterId: string,
  accessToken: string,
): Promise<{ chapter: WriterChapterDetail }> {
  return apiRequest(`/writer/contents/${contentId}/chapters/${chapterId}`, {
    accessToken,
  })
}

export function updateWriterChapter(
  contentId: string,
  chapterId: string,
  body: FormData,
  accessToken: string,
): Promise<{ chapter: CreatedWriterChapter }> {
  return apiRequest(`/writer/contents/${contentId}/chapters/${chapterId}`, {
    method: 'PATCH',
    accessToken,
    body,
  })
}

export function bulkUpdateWriterChapterPrice(
  contentId: string,
  chapterIds: string[],
  price: number,
  accessToken: string,
): Promise<{ updated_count: number }> {
  return apiRequest(`/writer/contents/${contentId}/chapters/bulk-price`, {
    method: 'PATCH',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter_ids: chapterIds, price }),
  })
}

export function bulkUpdateWriterChapterStatus(
  contentId: string,
  chapterIds: string[],
  status: ChapterStatus,
  publishedAt: string | undefined,
  accessToken: string,
): Promise<{ updated_count: number }> {
  return apiRequest(`/writer/contents/${contentId}/chapters/bulk-status`, {
    method: 'PATCH',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chapter_ids: chapterIds,
      status,
      ...(publishedAt ? { published_at: publishedAt } : {}),
    }),
  })
}
