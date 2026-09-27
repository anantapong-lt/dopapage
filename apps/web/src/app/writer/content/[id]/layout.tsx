import { ContentManagementTabs } from './components/content-management-tabs'

interface ContentManagementLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function ContentManagementLayout({
  children,
  params,
}: ContentManagementLayoutProps) {
  const { id } = await params

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto w-full min-w-0 max-w-full overflow-x-clip">
        <ContentManagementTabs contentId={id} />
        {children}
      </div>
    </main>
  )
}
