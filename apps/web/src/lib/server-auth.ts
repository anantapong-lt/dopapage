import 'server-only'

import { cookies } from 'next/headers'
import type { AuthUser } from '@/interface/user.interface'
import type { TopupPageConfig } from '@/interface/topup.interface'
import type { FavoriteStoriesResponse, UserProfile } from '@/interface/profile.interface'
import type { AccountSecurity } from '@/interface/account-security.interface'
import type { WriterContentsResponse, WriterContentTab } from '@/interface/writer-content.interface'
import { SITE_CONFIG } from '@/site.config'

export interface PublicFeatureConfig {
  registration: boolean
  writer_application: boolean
  comments: boolean
}

function serverApiUrl(): string {
  const url = new URL(SITE_CONFIG.apiUrl, SITE_CONFIG.siteUrl)
  return url.toString().replace(/\/$/, '')
}

export async function getServerAuthUser(): Promise<AuthUser | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(`${serverApiUrl()}/auth/session`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Cookie: cookieHeader,
      },
    })

    if (!response.ok) return null

    const body = await response.json() as { user: AuthUser }
    return body.user
  } catch {
    return null
  }
}

/** Uses the refresh session cookie so account security can be rendered on the server. */
export async function getServerAccountSecurity(): Promise<AccountSecurity | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(`${serverApiUrl()}/auth/security/session`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Cookie: cookieHeader },
    })
    if (!response.ok) return null
    const body = await response.json() as { account: AccountSecurity }
    return body.account
  } catch {
    return null
  }
}

export async function getServerUnreadNotificationCount(): Promise<number> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return 0

  try {
    const response = await fetch(`${serverApiUrl()}/notifications/unread-count`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Cookie: cookieHeader,
      },
    })

    if (!response.ok) return 0

    const body = await response.json() as { count?: number }
    return typeof body.count === 'number' ? body.count : 0
  } catch {
    return 0
  }
}

export async function getServerTopupConfig(): Promise<TopupPageConfig | null> {
  try {
    const response = await fetch(`${serverApiUrl()}/site-config/topup`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return await response.json() as TopupPageConfig
  } catch {
    return null
  }
}

export async function getServerFeatureConfig(): Promise<PublicFeatureConfig | null> {
  try {
    const response = await fetch(`${serverApiUrl()}/site-config/features`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json() as { features?: PublicFeatureConfig }
    return body.features ?? null
  } catch {
    return null
  }
}

export async function getServerProfile(username: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(
      `${serverApiUrl()}/profiles/${encodeURIComponent(username)}`,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
    )
    if (!response.ok) return null
    const body = await response.json() as { profile: UserProfile }
    return body.profile
  } catch {
    return null
  }
}

export async function getServerFavoriteStories(
  type: 'novel' | 'manga',
  page = 1,
): Promise<FavoriteStoriesResponse | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(
      `${serverApiUrl()}/profiles/me/favorites?type=${type}&page=${page}&limit=12`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json', Cookie: cookieHeader },
      },
    )
    if (!response.ok) return null
    return await response.json() as FavoriteStoriesResponse
  } catch {
    return null
  }
}

export async function getServerWriterContents(
  tab: WriterContentTab,
  page: number,
  filters: { search: string; genreIds: string[]; status?: string },
): Promise<WriterContentsResponse | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader) return null

  const query = new URLSearchParams({ tab, page: String(page), limit: '10' })
  if (filters.search) query.set('search', filters.search)
  if (filters.genreIds.length > 0) query.set('genre_ids', filters.genreIds.join(','))
  if (filters.status) query.set('status', filters.status)

  try {
    const response = await fetch(`${serverApiUrl()}/writer/contents?${query}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Cookie: cookieHeader },
    })
    if (!response.ok) return null
    return await response.json() as WriterContentsResponse
  } catch {
    return null
  }
}
