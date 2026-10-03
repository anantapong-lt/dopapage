import type { LandingResponse, LandingSection } from '@/interface/landing.interface'
import type { StoryType } from '@/constants/story.constant'
import { apiRequest } from '@/lib/api-client'

interface LandingRequestOptions {
  accessToken?: string | null
  cookieHeader?: string
}

export function getLandingStories(
  section: LandingSection,
  page: number,
  limit: number,
  signal?: AbortSignal,
  categories?: string[],
  search?: string,
  contentType?: StoryType,
  options?: LandingRequestOptions,
): Promise<LandingResponse> {
  const searchParams = new URLSearchParams({
    section,
    page: String(page),
    limit: String(limit),
  })
  if (categories?.length) searchParams.set('category', categories.join(','))
  if (search) searchParams.set('search', search)
  if (contentType) searchParams.set('type', contentType)

  const userSpecificRequest = Boolean(options?.accessToken || options?.cookieHeader)
  return apiRequest<LandingResponse>(`/landing?${searchParams.toString()}`, {
    ...(userSpecificRequest ? { cache: 'no-store' as const } : { next: { revalidate: 60 } }),
    ...(options?.cookieHeader ? { headers: { Cookie: options.cookieHeader } } : {}),
    accessToken: options?.accessToken,
    signal,
  })
}
