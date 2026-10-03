import { apiRequest } from '@/lib/api-client'
import type { ReadingSettings } from '@/lib/reading-settings'

export function getReadingSettings(accessToken: string): Promise<{ reading_settings: ReadingSettings }> {
  return apiRequest('/profiles/me/reading-settings', { accessToken, cache: 'no-store' })
}

export function updateReadingSettings(
  settings: ReadingSettings,
  accessToken: string,
): Promise<{ reading_settings: ReadingSettings }> {
  return apiRequest('/profiles/me/reading-settings', {
    method: 'PUT',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}
