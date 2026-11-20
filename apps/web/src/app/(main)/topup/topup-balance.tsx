'use client'

import { WalletCards } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { SITE_CONFIG as DEFAULT_SITE_CONFIG } from '@/site.config'
import { useSiteConfig } from '@readji/shared/src/site-branding'

function formatNumber(value: number | string) {
  return Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type TopupBalanceProps = {
  initialBalance: number | string
}

export function TopupBalance({ initialBalance }: TopupBalanceProps) {
  const SITE_CONFIG = useSiteConfig(DEFAULT_SITE_CONFIG)
  const { user } = useAuth()
  const balance = user?.balance ?? initialBalance

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-2 sm:min-w-56 sm:gap-3 sm:rounded-xl sm:px-4 sm:py-3">
      <WalletCards className="size-4 shrink-0 text-primary sm:size-5" />
      <div>
        <p className="text-[10px] font-medium text-muted-foreground sm:text-[11px]">ยอดคงเหลือ</p>
        <p className="text-base font-bold leading-tight tabular-nums text-foreground sm:text-lg">
          {formatNumber(balance)}
          <span className="ml-1 text-[10px] font-semibold text-muted-foreground sm:text-xs">{SITE_CONFIG.coinName}</span>
        </p>
      </div>
    </div>
  )
}
