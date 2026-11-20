import type { Metadata } from 'next'
import { SiteCoinName } from '@readji/shared/src/site-branding'
import { getServerAuthUser, getServerSiteConfig, getServerTopupConfig } from '@/lib/server-auth'
import { TopupBalance } from './topup-balance'
import { TopupForm } from './topup-form'

export async function generateMetadata(): Promise<Metadata> {
  const SITE_CONFIG = await getServerSiteConfig()
  return {
    title: `เติม${SITE_CONFIG.coinName}`,
    description: `เลือกแพ็กเกจเพื่อเติม${SITE_CONFIG.coinName}สำหรับอ่านตอนที่คุณชื่นชอบ`,
    alternates: { canonical: '/topup' },
    robots: { index: true, follow: true },
  }
}

export default async function TopupPage() {
  const [user, config] = await Promise.all([getServerAuthUser(), getServerTopupConfig()])
  const topupConfig = config ?? { topup: { packages: [] }, enabled: false }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-10">
      <section className="flex items-center justify-between gap-3 border-b border-border pb-4 sm:gap-4 sm:pb-6">
        <div>
          <h1 className="readji-page-title text-xl sm:text-2xl md:text-3xl">เติม<SiteCoinName /></h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">เลือกแพ็กเกจสำหรับปลดล็อกตอนที่ต้องการอ่าน</p>
        </div>

        {user && <TopupBalance initialBalance={user.balance} />}
      </section>

      {topupConfig.enabled ? (
        <TopupForm packages={topupConfig.topup.packages} />
      ) : (
        <section className="readji-surface mt-5 rounded-2xl p-8 text-center sm:mt-7 sm:p-12">
          <h2 className="text-lg font-bold text-foreground">ระบบเติมเงินปิดให้บริการชั่วคราว</h2>
          <p className="mt-2 text-sm text-muted-foreground">กรุณากลับมาใช้บริการใหม่ภายหลัง</p>
        </section>
      )}
    </div>
  )
}
