import { db } from '../../db'

export interface AdminSiteConfig {
  site: {
    name: string
    tagline: string
    description: string
    site_url: string
    coin_name: string
  }
  topup: { packages: { amount: string; bonus: string }[] }
  withdrawal: { commission_percent: string }
  features: {
    registration: boolean
    writer_application: boolean
    comments: boolean
    topup: boolean
    withdrawals: boolean
  }
}

const initialAdminSiteConfig: AdminSiteConfig = {
  site: {
    name: 'Dopapage',
    tagline: '',
    description: '',
    site_url: 'http://localhost:3000',
    coin_name: 'เหรียญ',
  },
  topup: {
    packages: [50, 100, 300, 500, 1000, 3000].map((amount) => ({ amount: String(amount), bonus: '0' })),
  },
  withdrawal: { commission_percent: '10' },
  features: {
    registration: true,
    writer_application: true,
    comments: true,
    topup: true,
    withdrawals: false,
  },
}

async function initializeAdminSiteConfig(): Promise<void> {
  await db.begin(async (transaction) => {
    for (const [key, value] of Object.entries(initialAdminSiteConfig)) {
      await transaction`
        INSERT INTO website_configs (key, value, description)
        VALUES (${key}, ${JSON.stringify(value)}::JSONB, 'Admin site configuration')
        ON CONFLICT (key) DO NOTHING
      `
    }
  })
}

export async function getAdminSiteConfig(): Promise<AdminSiteConfig> {
  await initializeAdminSiteConfig()
  const rows = await db<{ key: keyof AdminSiteConfig; value: unknown }[]>`
    SELECT key, value FROM website_configs
    WHERE key IN ('site', 'topup', 'withdrawal', 'features')
  `
  const config = {} as AdminSiteConfig
  for (const row of rows) {
    if (row.value && typeof row.value === 'object') config[row.key] = row.value as never
  }
  if (config.site) {
    const { admin_url: _adminUrl, ...site } = config.site as AdminSiteConfig['site'] & { admin_url?: string }
    config.site = site
  }
  if (!config.site || !config.topup || !config.withdrawal || !config.features) {
    throw new Error('Website configuration is incomplete')
  }
  return config
}

export async function getPublicTopupConfig(): Promise<Pick<AdminSiteConfig, 'topup' | 'features'>> {
  const config = await getAdminSiteConfig()
  return {
    topup: config.topup,
    features: config.features,
  }
}

export async function saveAdminSiteConfig(config: AdminSiteConfig): Promise<AdminSiteConfig> {
  await db.begin(async (transaction) => {
    for (const [key, value] of Object.entries(config)) {
      await transaction`
        INSERT INTO website_configs (key, value, description, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}::JSONB, 'Admin site configuration', NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `
    }
  })
  return getAdminSiteConfig()
}
