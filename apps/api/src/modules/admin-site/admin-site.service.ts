import { db } from '../../db'
import sharp from 'sharp'
import { createPublicAssetUrl, uploadAsset } from '../assets/local-asset.service'

export interface AdminSiteConfig {
  site: {
    name: string
    tagline: string
    description: string
    site_url: string
    coin_name: string
    logo_key?: string
    favicon_key?: string
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

function parseConfigValue(value: unknown): unknown {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
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

export async function getAdminSiteConfig(): Promise<AdminSiteConfig & { logo_url: string | null; favicon_url: string | null }> {
  await initializeAdminSiteConfig()
  const rows = await db<{ key: keyof AdminSiteConfig; value: unknown }[]>`
    SELECT key, value FROM website_configs
    WHERE key IN ('site', 'topup', 'withdrawal', 'features')
  `
  const config = {} as AdminSiteConfig
  for (const row of rows) {
    const value = parseConfigValue(row.value)
    if (value && typeof value === 'object') config[row.key] = value as never
  }
  if (config.site) {
    const { admin_url: _adminUrl, ...site } = config.site as AdminSiteConfig['site'] & { admin_url?: string }
    config.site = site
  }
  if (!config.site || !config.topup || !config.withdrawal || !config.features) {
    throw new Error('Website configuration is incomplete')
  }
  return {
    ...config,
    logo_url: config.site.logo_key ? createPublicAssetUrl(config.site.logo_key) : null,
    favicon_url: config.site.favicon_key ? createPublicAssetUrl(config.site.favicon_key) : null,
  }
}

export async function getPublicTopupConfig(): Promise<Pick<AdminSiteConfig, 'topup' | 'features'>> {
  const config = await getAdminSiteConfig()
  return {
    topup: config.topup,
    features: config.features,
  }
}

export async function saveAdminSiteConfig(config: AdminSiteConfig) {
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

export class InvalidSiteLogoError extends Error {}

async function optimizeSiteImage(file: File, kind: 'logo' | 'favicon'): Promise<Buffer> {
  try {
    const input = Buffer.from(await file.arrayBuffer())
    const options = { limitInputPixels: 25_000_000, failOn: 'warning' as const }
    const metadata = await sharp(input, options).metadata()
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
      throw new Error('Unsupported logo image')
    }
    const image = sharp(input, options).rotate()
    if (kind === 'favicon') {
      return await image
        .resize({ width: 48, height: 48, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    }
    return await image
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ lossless: true })
      .toBuffer()
  } catch {
    throw new InvalidSiteLogoError('กรุณาเลือกไฟล์ PNG, JPG หรือ WebP แบบภาพนิ่งที่ถูกต้องและมีขนาดภาพไม่เกิน 25 ล้านพิกเซล')
  }
}

export async function uploadSiteLogo(file: File): Promise<{ logo_key: string; logo_url: string }> {
  const image = await optimizeSiteImage(file, 'logo')
  const logo_key = await uploadAsset(`site/logos/${crypto.randomUUID()}.webp`, image, {
    bucket: 'public', contentType: 'image/webp',
  })
  return { logo_key, logo_url: createPublicAssetUrl(logo_key) }
}

export async function uploadSiteFavicon(file: File): Promise<{ favicon_key: string; favicon_url: string }> {
  const image = await optimizeSiteImage(file, 'favicon')
  const favicon_key = await uploadAsset(`site/favicons/${crypto.randomUUID()}.png`, image, {
    bucket: 'public', contentType: 'image/png',
  })
  return { favicon_key, favicon_url: createPublicAssetUrl(favicon_key) }
}
