import Link from 'next/link'
import { SiteLogo } from '@readji/shared/src/site-branding'
import { Skeleton } from '@/components/ui/skeleton'
import { getServerAuthUser, getServerUnreadNotificationCount, type PublicFeatureConfig } from '@/lib/server-auth'
import { SITE_CONFIG } from '@/site.config'
import { NavbarClient } from './navbar-client'

export function NavbarSkeleton() {
  return (
    <header aria-busy="true" aria-label="กำลังโหลดเมนู" className="sticky top-0 z-50 border-b border-border/70 bg-background/78 shadow-[0_8px_28px_-24px_rgb(45_29_32_/_0.72)] backdrop-blur-xl">
      <div className="mx-auto flex h-[4.35rem] w-full max-w-7xl items-center justify-between px-4 md:px-8">
        <Link href="/" aria-label={SITE_CONFIG.name} className="flex shrink-0 items-center">
          <SiteLogo className="aspect-[1185/321] h-9 -translate-y-1 shrink-0" fallback={<span aria-hidden="true" className="aspect-[1185/321] h-9 -translate-y-1 bg-gradient-to-r from-[#54252b] to-[#b56871] [mask-image:url(/readji-wordmark.png)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:url(/readji-wordmark.png)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]" />} />
        </Link>
        <Skeleton className="h-10 w-28 rounded-full md:w-60" />
      </div>
    </header>
  )
}

export async function Navbar({ featuresPromise }: { featuresPromise: Promise<PublicFeatureConfig | null> }) {
  const [user, features] = await Promise.all([getServerAuthUser(), featuresPromise])
  const unreadNotificationCount = user ? await getServerUnreadNotificationCount() : 0

  return <NavbarClient initialUser={user} initialUnreadNotificationCount={unreadNotificationCount} features={features} />
}
