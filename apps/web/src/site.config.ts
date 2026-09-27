import { SITE_CONFIG as SHARED_SITE_CONFIG } from '@readji/shared/src/site-config'

const resolveApiUrl = () => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  }
  return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
}

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://redji-web.vercel.app' : 'http://localhost:3000')

export const SITE_CONFIG = {
  type: 'novel' as 'novel' | 'manga',
  name: 'Dopapage',
  tagline: 'อ่านนิยายออนไลน์ฟรี',
  description: 'แหล่งรวมนิยายออนไลน์และการ์ตูนคุณภาพ อัปเดตทุกวัน',
  apiUrl: resolveApiUrl(),
  siteUrl,
  adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3002',
  pageSize: 24,
  coinName: SHARED_SITE_CONFIG.coinName,
} as const

export function getApiUrl(path: string): string {
  const base = SITE_CONFIG.apiUrl.replace(/\/+$/, '')
  const suffix = path.replace(/^\/+/, '')
  const browserOrigin = typeof window === 'undefined' ? SITE_CONFIG.siteUrl : window.location.origin

  return new URL(`${base}/${suffix}`, browserOrigin).toString()
}

export const isNovelFirst = SITE_CONFIG.type === 'novel'
export const isMangaFirst = SITE_CONFIG.type === 'manga'

export const primaryTypeName = isNovelFirst ? 'นิยาย' : 'การ์ตูน'
