import type { Metadata } from 'next'
import { SiteBrandingProvider } from '@readji/shared/src/site-branding'
import { AuthProvider } from '@/components/auth/auth-provider'
import { Toaster } from '@/components/ui/sonner'
import { getApiUrl, SITE_CONFIG } from '@/site.config'
import { notoSansThai, notoSerifThai, prompt, sarabun } from '@/lib/fonts'
import './globals.css'

// ─── Metadata ──────────────────────────────────────────────────────────────
// Next.js ใส่ <title> และ <meta> ให้อัตโนมัติ
// metadataBase จำเป็นสำหรับ URL แบบ relative ในหน้าลูก (og:image, canonical ฯลฯ) — ไม่งั้น build error
// รูปแชร์ลิงก์ใช้โลโก้ที่แอดมินตั้งไว้ใน /site-config/branding (ไม่มีหรือโหลดไม่ได้ → icon.png เดิม)
async function loadBrandingLogoUrl() {
  try {
    const response = await fetch(getApiUrl('/site-config/branding'), { next: { revalidate: 60 }, signal: AbortSignal.timeout(3000) })
    if (!response.ok) return null
    const data = (await response.json()) as { logo_url?: unknown }
    return typeof data.logo_url === 'string' && data.logo_url ? data.logo_url : null
  } catch {
    return null
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const shareImage = (await loadBrandingLogoUrl()) ?? '/icon.png'

  return {
    metadataBase: new URL(SITE_CONFIG.siteUrl),
    title: {
      default: SITE_CONFIG.name,
      template: `%s | ${SITE_CONFIG.name}`, // หน้าอื่นจะได้ "ชื่อหน้า | Readji"
    },
    description: SITE_CONFIG.description,
    openGraph: {
      title: SITE_CONFIG.name,
      description: SITE_CONFIG.description,
      type: 'website',
      images: [{ url: shareImage, alt: `โลโก้ ${SITE_CONFIG.name}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_CONFIG.name,
      description: SITE_CONFIG.description,
      images: [shareImage],
    },
  }
}

// ─── Root Layout ───────────────────────────────────────────────────────────
// ไฟล์นี้ wrap ทุกหน้า — เพิ่มอะไรตรงนี้จะมีผลกับทุกหน้าเลย

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${notoSansThai.variable} ${notoSerifThai.variable} ${sarabun.variable} ${prompt.variable} font-sans antialiased`}>
        <SiteBrandingProvider apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        </SiteBrandingProvider>
      </body>
    </html>
  )
}
