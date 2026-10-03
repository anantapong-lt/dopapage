import { StoryResultsGrid } from '@/components/home/story-results-grid'
import { ContentFilterDialog } from './content-filter-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getLandingStories } from '@/controllers/landing.controller'
import { StoryType } from '@/constants/story.constant'
import type { LandingSection } from '@/interface/landing.interface'
import { SearchIcon, SearchXIcon } from 'lucide-react'
import { cookies } from 'next/headers'

// Search results come from the API service, which is unavailable while the
// web image itself is being built.
export const dynamic = 'force-dynamic'

interface SearchPageProps {
  searchParams: Promise<{ category?: string | string[]; search?: string; sort?: string; type?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { category: categoryParam, search: searchParam, sort: sortParam, type: typeParam } = await searchParams
  const categories = [...new Set((Array.isArray(categoryParam) ? categoryParam : [categoryParam])
    .flatMap((category) => category?.split(',') ?? [])
    .map((category) => category.trim())
    .filter(Boolean))]
  const search = searchParam?.trim() || undefined
  const contentType = typeParam === StoryType.NOVEL || typeParam === StoryType.MANGA ? typeParam : undefined
  const section: LandingSection = sortParam === 'latest' || sortParam === 'weekly' || sortParam === 'all-time' || sortParam === 'most-followed'
    ? sortParam
    : 'random'
  const data = await getLandingStories(section, 1, 12, undefined, categories, search, contentType, {
    cookieHeader: (await cookies()).toString(),
  })

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
      <form className="mx-auto mt-5 flex w-full gap-2 md:w-[70%]" method="get">
        {categories.map((category) => <input key={category} type="hidden" name="category" value={category} />)}
        <Input
          name="search"
          type="search"
          defaultValue={search}
          placeholder="ค้นหาชื่อนิยาย"
          aria-label="ค้นหาชื่อนิยาย"
          className="h-12 flex-1 bg-white text-base"
        />
        <ContentFilterDialog value={contentType} section={section} categorySlugs={categories} />
        <Button type="submit" size="icon" className="size-12" aria-label="ค้นหา" title="ค้นหา">
          <SearchIcon className="size-5" />
        </Button>
      </form>
      <div className="mt-6">
        {data.stories.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center">
            <SearchXIcon className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">ไม่พบผลลัพธ์</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? 'ลองเปลี่ยนคำค้นหาแล้วค้นหาอีกครั้ง' : 'ไม่พบนิยายในหมวดหมู่ที่เลือก'}
            </p>
          </div>
        ) : (
          <StoryResultsGrid initialData={data} renderedAt={Date.now()} categories={categories} search={search} contentType={contentType} mobileInfiniteScroll />
        )}
      </div>
    </main>
  )
}
