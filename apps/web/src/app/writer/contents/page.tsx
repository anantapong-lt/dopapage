import { StoryStatus } from '@/constants/story.constant'
import type { WriterContentTab } from '@/interface/writer-content.interface'
import { getServerWriterContents } from '@/lib/server-auth'
import { WriterContents } from './components/writer-contents'

interface WriterContentsPageProps {
  searchParams: Promise<{
    tab?: string | string[]
    page?: string | string[]
    search?: string | string[]
    genre_ids?: string | string[]
    status?: string | string[]
  }>
}

export default async function WriterContentsPage({ searchParams }: WriterContentsPageProps) {
  const params = await searchParams
  const activeTab: WriterContentTab = params.tab === 'cartoon' ? 'cartoon' : 'novel'
  const requestedPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const search = typeof params.search === 'string' ? params.search : ''
  const genreIds = typeof params.genre_ids === 'string'
    ? params.genre_ids.split(',').filter(Boolean)
    : []
  const status = typeof params.status === 'string' && Object.values(StoryStatus).includes(params.status as StoryStatus)
    ? params.status as StoryStatus
    : undefined

  const filters = { search, genreIds, status }
  const initialResult = await getServerWriterContents(activeTab, page, filters)

  return <WriterContents activeTab={activeTab} page={page} filters={filters} initialResult={initialResult} />
}
