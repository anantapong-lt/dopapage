import { redirect } from 'next/navigation'

interface ContentManagementPageProps {
  params: Promise<{ id: string }>
}

export default async function ContentManagementPage({ params }: ContentManagementPageProps) {
  const { id } = await params

  redirect(`/writer/content/${id}/content`)
}
