'use client'

import Link from 'next/link'
import { SiteLogo } from '@readji/shared/src/site-branding'
import { SITE_CONFIG } from '@/site.config'

export function Footer(_: { registrationEnabled: boolean }) {
  return (
    <footer className="mt-16 bg-[linear-gradient(135deg,#34181d_0%,#54252b_56%,#713b44_100%)] shadow-[0_-18px_44px_-40px_rgb(45_29_32_/_0.8)]">
      <div className="mx-auto max-w-[1280px] px-4 py-14 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <Link href="/" className="text-2xl font-extrabold tracking-[-0.04em] text-[#F1F1EF] transition-opacity hover:opacity-80">
              <SiteLogo className="h-12 w-44" fallback="Dopapage" />
            </Link>
            <p className="mt-3 max-w-sm text-sm text-[#F1F1EF]/70">{SITE_CONFIG.description}</p>
          </div>

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
          © {new Date().getFullYear()} Dopapage สงวนลิขสิทธิ์
        </div>
      </div>
    </footer>
  )
}
