'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Banknote,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Cpu,
  FileText,
  LayoutTemplate,
  LogOut,
  PenSquare,
  ReceiptText,
  ShieldCheck,
  UserCog,
  Users,
  WalletCards,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { NotificationBell } from '@readji/shared/src/notification-bell'
import { useAdminAuth } from '@/components/admin-auth-provider'
import { Button } from '@/components/ui/button'
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

const navigation = [
  { label: 'ภาพรวม', items: [{ href: '/dashboard', label: 'Dashboard', icon: BarChart3 }] },
  { label: 'จัดการเนื้อหา', items: [{ href: '/works', label: 'ผลงานทั้งหมด', icon: BookOpen }] },
  {
    label: 'จัดการผู้ใช้งาน',
    items: [
      { href: '/users', label: 'ผู้ใช้งาน', icon: Users },
      { href: '/writers', label: 'นักเขียน', icon: PenSquare },
      { href: '/admin-account', label: 'บัญชีแอดมิน', icon: UserCog },
      { href: '/writer-applications', label: 'คำขอเป็นนักเขียน', icon: ClipboardCheck },
    ],
  },
  {
    label: 'การเงิน',
    items: [
      { href: '/transactions', label: 'คำขอถอน', icon: Banknote },
      { href: '/topups', label: 'รายการเติมเงิน', icon: WalletCards },
      { href: '/purchases', label: 'ประวัติการซื้อ', icon: ReceiptText },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { href: '/site', label: 'ตั้งค่าเว็บไซต์', icon: LayoutTemplate },
      { href: '/agreements', label: 'จัดการข้อตกลงการใช้งาน', icon: FileText },
    ],
  },
  { label: 'ระบบ', items: [{ href: '/system', label: 'สถานะระบบ', icon: Cpu }] },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { accessToken, logout, user } = useAdminAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLDivElement | null>(null)
  const initials = user?.display_name.trim().slice(0, 1).toUpperCase() ?? 'A'

  return (
    <SidebarPrimitive>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Dopapage Admin</span>
                <span className="truncate text-xs text-sidebar-foreground/70">CONTROL CENTER</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map(({ label, items }) => (
          <SidebarGroup key={label}>
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map(({ href, label: itemLabel, icon: Icon }) => {
                  const isActive = pathname === href
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<Link href={href} />}
                        className={isActive ? '!bg-primary !text-white hover:!bg-primary/90 [&_svg]:!text-white' : ''}
                      >
                        <Icon />
                        {itemLabel}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter ref={setNotificationAnchor} className="border-t p-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.display_name ?? 'Super Admin'}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{user?.email}</p>
          </div>
          <NotificationBell
            apiUrl={apiUrl}
            accessToken={accessToken}
            presentation={isMobile ? 'bottom-sheet' : 'popover'}
            side={isMobile ? 'top' : 'right'}
            align="end"
            anchorElement={isMobile ? undefined : notificationAnchor}
            triggerClassName="relative flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onNotificationClick={(notification) => {
              setOpenMobile(false)
              router.push(notification.target_url ?? '/transactions')
            }}
          />
          {/*
        <Popover open={isNotificationOpen} onOpenChange={setIsNotificationOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="relative flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label={unreadCount > 0 ? `การแจ้งเตือนใหม่ ${unreadCount} รายการ` : 'การแจ้งเตือน'}>
              <Bell className="size-4" />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" sideOffset={10} className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div><p className="font-semibold">การแจ้งเตือน</p><p className="text-xs text-muted-foreground">รายการล่าสุดสำหรับคุณ</p></div>
              {unreadCount > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">ใหม่ {unreadCount}</span>}
            </div>
            {isLoadingNotifications ? <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />กำลังโหลด...</div> : notifications.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p> : <div className="max-h-80 overflow-y-auto p-2">{notifications.map((notification) => {
              const Icon = notificationIcon(notification.type)
              return <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-accent ${notification.read_at ? '' : 'bg-primary/5'}`}>
                <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${notificationIconClass(notification.type)}`}><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="flex items-start gap-2"><span className="flex-1 truncate font-medium">{notification.title}</span>{!notification.read_at && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-label="ยังไม่ได้อ่าน" />}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.message}</span><span className="mt-1.5 block text-[11px] text-muted-foreground">{new Date(notification.created_at).toLocaleString('th-TH')}</span></span>
              </button>
            })}</div>}
          </PopoverContent>
        </Popover>
        */}
          <Button
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            onClick={() => void logout()}
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </SidebarFooter>
    </SidebarPrimitive>
  )
}
