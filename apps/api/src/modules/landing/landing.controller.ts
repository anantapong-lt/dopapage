import type { ContentType, LandingSection } from './landing.schema'
import { getContentDisplayFilters, getLandingStories } from './landing.service'

interface GetLandingInput {
  section: LandingSection
  page?: number
  limit?: number
  category?: string
  search?: string
  type?: ContentType
}

export async function getLanding(input: GetLandingInput, userId: string | null) {
  try {
    const contentFilters = await getContentDisplayFilters(userId)
    return await getLandingStories(
      input.section,
      input.page ?? 1,
      input.limit ?? 12,
      input.category
        ?.split(',')
        .map((category) => category.trim().toLowerCase())
        .filter(Boolean) ?? [],
      input.search?.trim() ?? '',
      input.type ?? null,
      contentFilters,
    )
  } catch (error) {
    console.error('Unable to load landing stories', error)
    return Response.json(
      { message: 'ไม่สามารถโหลดข้อมูลหน้าหลักได้ กรุณาลองใหม่อีกครั้ง' },
      { status: 500 },
    )
  }
}
