'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Coins, History, Home, PenLine, Rss, Search, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { SITE_CONFIG } from '@/site.config'

const EXPLORE_ITEMS = [
  { label: 'หน้าแรก', icon: Home, href: '/' },
  { label: 'ฟีด', icon: Rss },
  { label: 'ค้นหา', icon: Search },
  { label: `เติม${SITE_CONFIG.coinName}`, icon: Coins, href: '/topup' },
  { label: 'เป็นนักเขียน', icon: PenLine },
]

const ACCOUNT_ITEMS = [
  { label: 'โปรไฟล์', icon: UserRound },
  { label: 'ชวนเพื่อน', icon: UsersRound },
  { label: 'ประวัติการซื้อ', icon: History },
  { label: 'ตั้งค่า', icon: ShieldCheck },
]

function FooterItem({ label, icon: Icon, href }: { label: string; icon: typeof Home; href?: string }) {
  if (href) {
    return (
      <Link href={href} className="flex items-center gap-2 text-sm text-[#F1F1EF]/70 transition-colors hover:translate-x-0.5 hover:text-[#F1F1EF]">
        <Icon className="size-4" />
        {label}
      </Link>
    )
  }

  return (
    <span aria-disabled="true" title="ยังไม่เปิดใช้งาน" className="flex cursor-not-allowed items-center gap-2 text-sm text-[#F1F1EF]/35">
      <Icon className="size-4" />
      {label}
    </span>
  )
}

export function Footer({ registrationEnabled }: { registrationEnabled: boolean }) {
  const pathname = usePathname()
  if (/^\/content\/[^/]+\/[^/]+$/.test(pathname)) return null
  const isHomePage = pathname === '/'
  const brandName = isHomePage ? 'Dopapage' : SITE_CONFIG.name

  return (
    <footer className="mt-16 bg-[linear-gradient(135deg,#34181d_0%,#54252b_56%,#713b44_100%)] shadow-[0_-18px_44px_-40px_rgb(45_29_32_/_0.8)]">
      <div className="mx-auto max-w-[1280px] px-4 py-14 md:px-8">
        <div className={isHomePage ? 'grid gap-10 sm:grid-cols-2' : 'grid gap-10 sm:grid-cols-2 lg:grid-cols-5'}>
          <div className={isHomePage ? undefined : 'lg:col-span-2'}>
            <Link href="/" className="text-2xl font-extrabold tracking-[-0.04em] text-[#F1F1EF] transition-opacity hover:opacity-80">
              {brandName}
            </Link>
            <p className="mt-3 max-w-sm text-sm text-[#F1F1EF]/70">{SITE_CONFIG.description}</p>
          </div>

          {!isHomePage && <div>
            <h3 className="mb-4 text-sm font-semibold text-[#F1F1EF]">สำรวจ</h3>
            <ul className="flex flex-col gap-2.5">
              {EXPLORE_ITEMS.map((item) => <li key={item.label}><FooterItem {...item} /></li>)}
            </ul>
          </div>}

          {!isHomePage && <div>
            <h3 className="mb-4 text-sm font-semibold text-[#F1F1EF]">บัญชี</h3>
            <ul className="flex flex-col gap-2.5">
              {ACCOUNT_ITEMS.map((item) => <li key={item.label}><FooterItem {...item} /></li>)}
            </ul>
            <div className="mt-4 flex gap-3 text-sm">
              <Link href="/login" className="text-[#F1F1EF]/70 hover:text-[#F1F1EF]">เข้าสู่ระบบ</Link>
              {registrationEnabled && <Link href="/register" className="text-[#F1F1EF]/70 hover:text-[#F1F1EF]">สมัครสมาชิก</Link>}
            </div>
          </div>}

          <div>
            <h3 className="mb-4 text-sm font-semibold text-[#F1F1EF]">ช่วยเหลือ</h3>
            <ul className="flex flex-col gap-2.5 text-sm text-[#F1F1EF]/35">
              <li aria-disabled="true" title="ยังไม่เปิดใช้งาน">ติดต่อแอดมิน</li>
              <li aria-disabled="true" title="ยังไม่เปิดใช้งาน">คำถามที่พบบ่อย</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-[#F1F1EF]/15">
        <div className="mx-auto max-w-[1280px] px-4 py-5 text-center text-xs text-[#F1F1EF]/60 md:px-8">
          © {new Date().getFullYear()} {brandName} สงวนลิขสิทธิ์
        </div>
      </div>
    </footer>
  )
}
