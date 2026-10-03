import { findMyFavoriteStories, findMyProfile, findPublicProfileByUsername, findRandomWriterProfiles, findReadingSettings, updateMyProfile, updateMyProfileAvatar, updateMyProfileCover, updateReadingSettings, type ReadingSettings } from './profiles.service'

export async function getRandomWriterProfilesResponse(limit?: number) {
  return { profiles: await findRandomWriterProfiles(limit ?? 5) }
}

export async function getMyProfileResponse(userId: string) {
  const profile = await findMyProfile(userId)
  return profile ? { profile } : Response.json({ message: 'ไม่พบโปรไฟล์' }, { status: 404 })
}

export async function getReadingSettingsResponse(userId: string) {
  const readingSettings = await findReadingSettings(userId)
  return readingSettings
    ? { reading_settings: readingSettings }
    : Response.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 })
}

export async function updateReadingSettingsResponse(userId: string, settings: ReadingSettings) {
  const readingSettings = await updateReadingSettings(userId, settings)
  return readingSettings
    ? { reading_settings: readingSettings }
    : Response.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 })
}

export async function getMyFavoriteStoriesResponse(
  userId: string | undefined,
  type: 'novel' | 'manga',
  page?: number,
  limit?: number,
) {
  if (!userId) return Response.json({ message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
  return findMyFavoriteStories(userId, type, page ?? 1, limit ?? 12)
}

export async function getPublicProfileResponse(username: string, type?: 'novel' | 'manga', page?: number, limit?: number) {
  const profile = await findPublicProfileByUsername(username, type ?? 'novel', page ?? 1, limit ?? 12)
  return profile ? { profile } : Response.json({ message: 'ไม่พบโปรไฟล์' }, { status: 404 })
}

export async function updateMyProfileResponse(
  userId: string,
  input: { bio?: string | null; social_links?: Record<string, string | undefined> },
) {
  const profile = await updateMyProfile(userId, input)
  return profile ? { profile } : Response.json({ message: 'ไม่พบโปรไฟล์' }, { status: 404 })
}

export async function updateMyProfileCoverResponse(userId: string, cover: File) {
  const profile = await updateMyProfileCover(userId, cover)
  return profile ? { profile } : Response.json({ message: 'ไม่พบโปรไฟล์' }, { status: 404 })
}

export async function updateMyProfileAvatarResponse(userId: string, avatar: File) {
  const profile = await updateMyProfileAvatar(userId, avatar)
  return profile ? { profile } : Response.json({ message: 'ไม่พบโปรไฟล์' }, { status: 404 })
}
