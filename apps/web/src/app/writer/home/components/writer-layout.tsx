'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { NotificationBell, NotificationDetailDialog, type NotificationItem } from '@readji/shared/src/notification-bell'
import {
  Banknote,
  BarChart3,
  BookOpen,
  FileText,
  Home,
  Menu,
  X,
} from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { useAuth } from '@/components/auth/auth-provider'
import { userRole, type AuthUser } from '@/interface/user.interface'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'

const writerNavigation = [
  { href: '/writer', label: 'แดชบอร์ด', icon: BarChart3, enabled: true },
  { href: '/writer/contents/?tab=novel', label: 'ผลงาน', icon: BookOpen, enabled: true },
  { href: '/writer/withdrawals', label: 'ถอนเงิน', icon: Banknote, enabled: true },
] as const

const writerInformationNavigation = [
  { href: '/writer/terms', label: 'ข้อกำหนดการใช้งาน', icon: FileText, enabled: true },
] as const

function DisabledNavigationItem({
  icon: Icon,
  label,
}: {
  icon: typeof BarChart3
  label: string
}) {
  return (
    <span
      aria-disabled="true"
      title="ยังไม่เปิดใช้งาน"
      className="flex min-h-10 cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground opacity-55"
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} />
      <span>{label}</span>
    </span>
  )
}

export function WriterLayout({ children, user }: { children: ReactNode; user: AuthUser }) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { accessToken } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  const userInitial = user.display_name.trim().charAt(0)
    || user.username.trim().charAt(0)
    || '?'
  const formattedBalance = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(user.balance))
  const pathContentId = /^\/writer\/content\/([^/]+)/.exec(pathname)?.[1]
  const selectedContentId = pathContentId ?? searchParams.get('content_id') ?? undefined
  const navigationItems = user.role === userRole.SUPER_ADMIN
    ? [
        {
          href: selectedContentId
            ? `/writer?content_id=${encodeURIComponent(selectedContentId)}`
            : '/writer',
          label: 'แดชบอร์ด',
          icon: BarChart3,
          enabled: Boolean(selectedContentId),
        },
        {
          href: selectedContentId
            ? `/writer/content/${encodeURIComponent(selectedContentId)}`
            : `${SITE_CONFIG.adminUrl}/works`,
          label: 'ผลงาน',
          icon: BookOpen,
          enabled: true,
        },
      ]
    : writerNavigation

  return (
    <div className="min-h-screen bg-background md:flex">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-4 text-sidebar-foreground backdrop-blur md:hidden">
        <div className="min-w-0">
          <p className="truncate font-bold tracking-[-0.025em]">หน้านักเขียน</p>
          <p className="truncate text-xs text-muted-foreground">฿{formattedBalance}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="เปิดเมนูนักเขียน"
          aria-expanded={isMobileMenuOpen}
          className="flex size-10 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent"
        >
          <Menu className="size-5" strokeWidth={1.8} />
        </button>
      </header>

      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="ปิดเมนูนักเขียน"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-50 cursor-default bg-foreground/35 md:hidden"
        />
      )}

      <aside
        aria-label="เมนูนักเขียน"
        className={`fixed inset-y-0 left-0 z-[60] flex h-[100dvh] w-[min(20rem,calc(100vw-1rem))] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:shrink-0 md:translate-x-0 md:shadow-none ${
          isMobileMenuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full md:visible'
        }`}
      >
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-bold tracking-[-0.025em]">หน้านักเขียน</p>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="ปิดเมนูนักเขียน"
              className="flex size-9 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent md:hidden"
            >
              <X className="size-5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="mx-4 rounded-2xl bg-sidebar-accent px-4 py-3.5">
          <p className="text-xs font-medium text-muted-foreground">ยอด{SITE_CONFIG.coinName}คงเหลือ</p>
          <p className="mt-0.5 flex items-center gap-2 text-xl font-bold text-primary">
            <GiTwoCoins className="size-5 shrink-0" aria-hidden="true" />
            <span>{formattedBalance}</span>
          </p>
        </div>

        <nav className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3" aria-label="เมนูนักเขียน">
          <div className="space-y-0.5">
            {navigationItems.map(({ enabled, href, icon: Icon, label }) => {
              const basePath = href.split('?')[0].replace(/\/$/, '')
              const isActive = pathname === basePath
                || (basePath !== '/writer' && pathname.startsWith(`${basePath}/`))
                || (basePath === '/writer/contents' && pathname.startsWith('/writer/content/'))

              return enabled ? (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent"
                  data-active={isActive || undefined}
                  style={isActive ? {
                    backgroundColor: 'var(--sidebar-primary)',
                    color: 'var(--sidebar-primary-foreground)',
                  } : undefined}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                  <span>{label}</span>
                </Link>
              ) : (
                <DisabledNavigationItem key={href} icon={Icon} label={label} />
              )
            })}
          </div>

          <div className="my-2 border-t border-sidebar-border" />

          <div className="space-y-0.5">
            {writerInformationNavigation.map(({ enabled, href, icon: Icon, label }) => {
              const isActive = enabled && (pathname === href || pathname.startsWith(`${href}/`))

              return enabled ? (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent"
                  data-active={isActive || undefined}
                  style={isActive ? {
                    backgroundColor: 'var(--sidebar-primary)',
                    color: 'var(--sidebar-primary-foreground)',
                  } : undefined}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                  <span>{label}</span>
                </Link>
              ) : (
                <DisabledNavigationItem key={label} icon={Icon} label={label} />
              )
            })}
          </div>
        </nav>

        <div className="px-3 pb-2">
          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex min-h-10 items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors hover:bg-sidebar-accent"
          >
            <Home className="size-4 shrink-0" strokeWidth={1.8} />
            <span>กลับหน้าแรก</span>
          </Link>
        </div>

        <div className="mx-3 border-t border-sidebar-border" />

        <footer className="p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
            <Link
              href="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label="ไปหน้าโปรไฟล์"
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="size-full object-cover" />
                ) : userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{user.display_name}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
            </Link>
            <NotificationBell
              apiUrl={SITE_CONFIG.apiUrl}
              accessToken={accessToken}
              side="top"
              align="end"
              triggerClassName="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onNotificationClick={setSelectedNotification}
            />
          </div>
        </footer>
      </aside>

      {children}

      <NotificationDetailDialog notification={selectedNotification} onOpenChange={(open) => { if (!open) setSelectedNotification(null) }} layerClassName="z-[80]" />
    </div>
  )
}
