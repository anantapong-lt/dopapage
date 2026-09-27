'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  ChevronDown,
  HistoryIcon,
  Home,
  LayoutDashboard,
  LibraryBig,
  LogIn,
  LogOut,
  Menu,
  PenLine,
  Plus,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { GiTwoCoins } from 'react-icons/gi'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-provider'
import { getBankConfigs, getWriterApplicationStatus } from '@/controllers/writer.controller'
import { getMyProfile } from '@/controllers/profile.controller'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { userRole, type AuthUser } from '@/interface/user.interface'
import { SITE_CONFIG } from '@/site.config'
import type { UserNotification } from '@/interface/notification.interface'
import type { BankConfig } from '@/interface/writer-bank-account.interface'
import type { PublicFeatureConfig } from '@/lib/server-auth'

const loadWriterApplicationDialog = () => import('./writer-application-dialog')
const WriterApplicationDialog = dynamic(
  () => loadWriterApplicationDialog().then((module) => module.WriterApplicationDialog),
  { ssr: false },
)
const NotificationBell = dynamic(
  () => import('@readji/shared/src/notification-bell').then((module) => module.NotificationBell),
  {
    ssr: false,
    loading: () => (
      <span className="readji-icon-button" aria-busy="true" aria-label="กำลังโหลดการแจ้งเตือน">
        <Bell className="size-5" />
      </span>
    ),
  },
)
const NotificationDetailDialog = dynamic(
  () => import('@readji/shared/src/notification-bell').then((module) => module.NotificationDetailDialog),
  { ssr: false },
)

const NAV_ITEMS = [{ label: 'หน้าแรก', icon: Home, href: '/' }]

interface WriterApplicationData {
  banks: BankConfig[]
  isPending: boolean
  hasSocialLink: boolean
}

function DisabledIconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} (ยังไม่เปิดใช้งาน)`}
      title="ยังไม่เปิดใช้งาน"
      className="readji-icon-button cursor-not-allowed opacity-45"
    >
      {children}
    </button>
  )
}

function DesktopNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-1.5 text-sm font-medium xl:flex">
      {NAV_ITEMS.map(({ label, icon: Icon, href }) =>
        href ? (
          <Link
            key={label}
            href={href}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all duration-200 ${
              pathname === href ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ) : (
          <span
            key={label}
            aria-disabled="true"
            title="ยังไม่เปิดใช้งาน"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground opacity-45"
          >
            <Icon className="size-4" />
            {label}
          </span>
        ),
      )}
    </nav>
  )
}

function formatBalance(balance: string) {
  return Number(balance).toLocaleString('th-TH')
}

function UserDropdownMenu({
  user,
  userInitial,
  compact = false,
  onLogout,
  onOpenWriterApplication,
}: {
  user: AuthUser
  userInitial: string
  compact?: boolean
  onLogout: () => void
  onOpenWriterApplication: () => void
}) {
  const avatar = (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground ${compact ? 'size-8 text-xs ring-2 ring-primary/35 ring-offset-2 ring-offset-background' : 'size-7 text-xs'}`}
    >
      {user.avatar_url ? <img src={user.avatar_url} alt="" className="size-full object-cover" /> : userInitial}
    </span>
  )

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label="เปิดเมนูผู้ใช้"
            title={user.display_name}
            className="readji-icon-button cursor-pointer p-1"
          >
            {avatar}
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-0 gap-2 rounded-full bg-card/70 py-1.5 pr-2.5 pl-1.5 shadow-none"
          >
            {avatar}
            <span className="max-w-32 truncate font-semibold text-foreground">{user.display_name}</span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-aria-expanded/button:rotate-180" />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-2">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {user.avatar_url ? <img src={user.avatar_url} alt="" className="size-full object-cover" /> : userInitial}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground">{user.display_name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>

        <div className="mx-1 mb-2 flex items-center justify-between gap-3 rounded-lg bg-accent/60 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-primary">
            <GiTwoCoins className="size-4 text-amber-500" />
            {formatBalance(user.balance)} {SITE_CONFIG.coinName}
          </span>
          <Button asChild size="sm" className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs">
            <Link href="/topup">
              <Plus className="size-3.5" />
              เติมเงิน
            </Link>
          </Button>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer py-2.5">
          <Link href="/favorites">
            <LibraryBig />
            ชั้นหนังสือ
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer py-2.5">
          <Link href="/profile">
            <UserRound />
            จัดการโปรไฟล์
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer py-2.5">
          <Link href="/transactions">
            <HistoryIcon />
            ประวัติการทำรายการ
          </Link>
        </DropdownMenuItem>
        {user.role === userRole.WRITER && (
          <DropdownMenuItem asChild className="cursor-pointer py-2.5">
            <Link href="/writer">
              <PenLine />
              โหมดนักเขียน
            </Link>
          </DropdownMenuItem>
        )}
        {user.role === userRole.USER && (
          <DropdownMenuItem onSelect={onOpenWriterApplication} className="cursor-pointer py-2.5">
            <PenLine />
            สมัครนักเขียน
          </DropdownMenuItem>
        )}
        {user.role === userRole.SUPER_ADMIN && (
          <DropdownMenuItem asChild className="cursor-pointer py-2.5">
            <a href={`${SITE_CONFIG.adminUrl}/dashboard`}>
              <LayoutDashboard />
              แดชบอร์ดแอดมิน
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onLogout}
          className="cursor-pointer py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut />
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NavbarClient({
  initialUser,
  initialUnreadNotificationCount,
  features,
}: {
  initialUser: AuthUser | null
  initialUnreadNotificationCount: number
  features: PublicFeatureConfig | null
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [readerNavbarVisible, setReaderNavbarVisible] = useState(true)
  const [writerApplicationOpen, setWriterApplicationOpen] = useState(false)
  const writerApplicationLoadingRef = useRef(false)
  const [writerApplicationData, setWriterApplicationData] = useState<WriterApplicationData | null>(null)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(initialUnreadNotificationCount)
  const [selectedNotification, setSelectedNotification] = useState<UserNotification | null>(null)
  const [hasHydrated, setHasHydrated] = useState(false)
  const pathname = usePathname()
  const { accessToken, logout, status, user: clientUser } = useAuth()
  const user = !hasHydrated || status === 'loading' ? initialUser : clientUser
  const isReaderPage = /^\/content\/[^/]+\/[^/]+$/.test(pathname)

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  useEffect(() => {
    if (!isReaderPage) {
      setReaderNavbarVisible(true)
      return
    }

    let previousScrollY = window.scrollY
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY <= 0) setReaderNavbarVisible(true)
      else if (currentScrollY > previousScrollY + 8) setReaderNavbarVisible(false)
      previousScrollY = currentScrollY
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isReaderPage])

  async function handleLogout() {
    await logout()
    setMobileMenuOpen(false)
  }

  async function openWriterApplicationDialog() {
    if (writerApplicationLoadingRef.current) return
    if (features?.writer_application && !accessToken) return

    writerApplicationLoadingRef.current = true
    const loadingToast = toast.loading('กำลังเตรียมข้อมูลสมัครนักเขียน...')
    try {
      if (!features?.writer_application) {
        await loadWriterApplicationDialog()
        setWriterApplicationOpen(true)
        return
      }
      if (!accessToken) return

      const [bankResult, statusResult, profileResult] = await Promise.all([
        getBankConfigs(accessToken),
        getWriterApplicationStatus(accessToken),
        getMyProfile(accessToken),
        loadWriterApplicationDialog(),
      ])
      setWriterApplicationData({
        banks: bankResult.banks,
        isPending: statusResult.status === 'pending',
        hasSocialLink: Object.values(profileResult.profile.social_links ?? {}).some((value) => Boolean(value?.trim())),
      })
      setWriterApplicationOpen(true)
    } catch {
      toast.error('ไม่สามารถตรวจสอบข้อมูลสำหรับสมัครเป็นนักเขียนได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      writerApplicationLoadingRef.current = false
      toast.dismiss(loadingToast)
    }
  }

  function handleWriterApplicationOpenChange(open: boolean) {
    setWriterApplicationOpen(open)
    if (!open) setWriterApplicationData(null)
  }

  const userInitial = user?.display_name.trim().charAt(0) || user?.username.trim().charAt(0) || '?'

  return (
    <>
      <header
        className={`sticky top-0 z-50 border-b border-border/70 bg-background/78 shadow-[0_8px_28px_-24px_rgb(45_29_32_/_0.72)] backdrop-blur-xl transition-transform duration-200 ${
          isReaderPage && !readerNavbarVisible ? '-translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8">
          <div className="flex h-[4.35rem] items-center justify-between">
            <div className="flex min-w-0 items-center gap-5 md:gap-7">
              <Link href="/" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
                <span
                  role="img"
                  aria-label="Dopapage"
                  className="aspect-[1185/321] h-9 -translate-y-1 bg-gradient-to-r from-[#54252b] to-[#b56871] [mask-image:url(/readji-wordmark.png)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:url(/readji-wordmark.png)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
                />
              </Link>
              <DesktopNav />
            </div>

            <div className="hidden shrink-0 items-center gap-1 md:flex">
              <Link href="/search" aria-label="ค้นหา" title="ค้นหา" className="readji-icon-button">
                <Search className="size-5" />
              </Link>
              {user ? (
                <NotificationBell
                  apiUrl={SITE_CONFIG.apiUrl}
                  accessToken={accessToken}
                  unreadCount={unreadNotificationCount}
                  onUnreadCountChange={setUnreadNotificationCount}
                  sideOffset={16}
                  onNotificationClick={(notification) => setSelectedNotification(notification)}
                />
              ) : (
                <DisabledIconButton label="การแจ้งเตือน">
                  <Bell className="size-5" />
                </DisabledIconButton>
              )}
              <div className="ml-1 flex min-w-[150px] shrink-0 items-center justify-end gap-2">
                {(!hasHydrated || status === 'loading') && !user ? (
                  <div className="h-10 w-32 animate-pulse rounded-full bg-muted" aria-label="กำลังตรวจสอบสถานะผู้ใช้" />
                ) : user ? (
                  <UserDropdownMenu
                    user={user}
                    userInitial={userInitial}
                    onLogout={() => void handleLogout()}
                    onOpenWriterApplication={() => void openWriterApplicationDialog()}
                  />
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full border border-primary/25 bg-card/70 px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-all hover:-translate-y-px hover:bg-primary hover:text-primary-foreground hover:shadow-md"
                  >
                    เข้าสู่ระบบ
                  </Link>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 md:hidden">
              <Link href="/search" aria-label="ค้นหา" title="ค้นหา" className="readji-icon-button">
                <Search className="size-5" />
              </Link>
              {user ? (
                <NotificationBell
                  apiUrl={SITE_CONFIG.apiUrl}
                  accessToken={accessToken}
                  presentation="bottom-sheet"
                  unreadCount={unreadNotificationCount}
                  onUnreadCountChange={setUnreadNotificationCount}
                  onNotificationClick={(notification) => setSelectedNotification(notification)}
                />
              ) : (
                <DisabledIconButton label="การแจ้งเตือน">
                  <Bell className="size-5" />
                </DisabledIconButton>
              )}
              {user ? (
                <UserDropdownMenu
                  compact
                  user={user}
                  userInitial={userInitial}
                  onLogout={() => void handleLogout()}
                  onOpenWriterApplication={() => void openWriterApplicationDialog()}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="เปิดเมนู"
                  aria-expanded={mobileMenuOpen}
                  className="readji-icon-button cursor-pointer"
                >
                  <Menu className="size-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="เมนูหลัก">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-foreground/35"
          />
          <aside className="absolute top-0 right-0 flex h-[100dvh] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden border-l border-border bg-card shadow-[-18px_0_48px_-28px_rgb(45_29_32_/_0.62)]">
            <div className="flex h-[4.35rem] shrink-0 items-center justify-between border-b border-border px-5">
              <span
                role="img"
                aria-label="Dopapage"
                className="aspect-[1185/321] h-7 -translate-y-1 bg-gradient-to-r from-[#54252b] to-[#b56871] [mask-image:url(/readji-wordmark.png)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:url(/readji-wordmark.png)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]"
              />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="ปิดเมนู"
                className="readji-icon-button cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <Home className="size-5 text-primary" />
                หน้าแรก
              </Link>
              {[
                ...(user ? [{ label: 'ประวัติทำรายการ', icon: HistoryIcon, href: '/transactions' }] : []),
                ...(user?.role === userRole.SUPER_ADMIN
                  ? [{ label: 'แดชบอร์ดแอดมิน', icon: LayoutDashboard, href: `${SITE_CONFIG.adminUrl}/dashboard` }]
                  : []),
                { label: 'ค้นหานิยาย', icon: Search },
                {
                  label: user?.role === userRole.WRITER ? 'โหมดนักเขียน' : 'สมัครนักเขียน',
                  icon: PenLine,
                  href: user?.role === userRole.WRITER ? '/writer' : undefined,
                  canApply: user?.role === userRole.USER,
                },
              ].map(({ label, icon: Icon, href, canApply }) =>
                canApply ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      void openWriterApplicationDialog()
                    }}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="size-5 text-primary" />
                    {label}
                  </button>
                ) : href ? (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="size-5 text-primary" />
                    {label}
                  </Link>
                ) : (
                  <span
                    key={label}
                    aria-disabled="true"
                    title="ยังไม่เปิดใช้งาน"
                    className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-muted-foreground opacity-45"
                  >
                    <Icon className="size-5" />
                    {label}
                  </span>
                ),
              )}
            </nav>

            <div className="shrink-0 space-y-2 border-t border-border p-4">
              {(!hasHydrated || status === 'loading') && !user ? (
                <div className="h-12 w-full animate-pulse rounded-xl bg-muted" aria-label="กำลังตรวจสอบสถานะผู้ใช้" />
              ) : user ? (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-accent/60 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-primary">
                      <GiTwoCoins className="size-4 text-amber-500" />
                      {formatBalance(user.balance)} {SITE_CONFIG.coinName}
                    </span>
                    <Button asChild size="sm" className="h-8 shrink-0 gap-1 rounded-full px-3 text-xs">
                      <Link href="/topup" onClick={() => setMobileMenuOpen(false)}>
                        <Plus className="size-3.5" />
                        เติมเงิน
                      </Link>
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="size-full object-cover" />
                      ) : (
                        userInitial
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{user.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                  >
                    <LogOut className="size-4" />
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <LogIn className="size-4" />
                    เข้าสู่ระบบ
                  </Link>
                  {features?.registration && (
                    <Link
                      href="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                    >
                      สมัครสมาชิก
                    </Link>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {writerApplicationOpen && (
        <WriterApplicationDialog
          open={writerApplicationOpen}
          onOpenChange={handleWriterApplicationOpenChange}
          writerApplicationEnabled={features?.writer_application === true}
          banks={writerApplicationData?.banks ?? []}
          isPending={writerApplicationData?.isPending ?? false}
          hasSocialLink={writerApplicationData?.hasSocialLink ?? false}
        />
      )}

      {selectedNotification && (
        <NotificationDetailDialog
          notification={selectedNotification}
          onOpenChange={(open) => {
            if (!open) setSelectedNotification(null)
          }}
        />
      )}
    </>
  )
}
