import { SITE_CONFIG } from '@/site.config'

export function GET() {
  const content = `# ${SITE_CONFIG.name}

> ${SITE_CONFIG.description}

Dopapage is a Thai-language platform for discovering online novels and comics.
Public story detail pages are server-rendered and contain the canonical title, author, genres, synopsis, cover, age rating, and readership count.

## Primary resources

- [Home](${SITE_CONFIG.siteUrl})
- [Public content sitemap](${SITE_CONFIG.siteUrl}/sitemap.xml)

## URL conventions

- Story detail: ${SITE_CONFIG.siteUrl}/content/{slug}

Content language: Thai (th)
`

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
