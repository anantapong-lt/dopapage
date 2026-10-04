import type { Metadata } from 'next'
import { SiteBrandingProvider } from '@readji/shared/src/site-branding'
import { Noto_Sans_Thai, Geist } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Dopapage Admin',
  description: 'Dopapage control center',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={cn('font-sans', geist.variable)}>
      <body className={geist.variable}>
        <SiteBrandingProvider apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}>
        {children}
        <Toaster position="top-right" />
        </SiteBrandingProvider>
      </body>
    </html>
  )
}
