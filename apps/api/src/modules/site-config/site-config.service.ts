import { db } from '../../db'
import { createPublicAssetUrl } from '../assets/local-asset.service'

export async function getPublicBrandingConfig(): Promise<{ logo_url: string | null; favicon_url: string | null }> {
  const [row] = await db<{ value: unknown }[]>`
    SELECT value FROM website_configs WHERE key = 'site'
  `
  const value = typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value
  const key = value && typeof value === 'object' && 'logo_key' in value ? value.logo_key : null
  const faviconKey = value && typeof value === 'object' && 'favicon_key' in value ? value.favicon_key : null
  return {
    logo_url: typeof key === 'string' && key ? createPublicAssetUrl(key) : null,
    favicon_url: typeof faviconKey === 'string' && faviconKey ? createPublicAssetUrl(faviconKey) : null,
  }
}

export interface PublicFeatureConfig {
  registration: boolean
  writer_application: boolean
  comments: boolean
}

function parseFeatureConfig(value: unknown): Partial<PublicFeatureConfig> | undefined {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  return value && typeof value === 'object' ? value as Partial<PublicFeatureConfig> : undefined
}

export async function getPublicFeatureConfig(): Promise<PublicFeatureConfig> {
  const [row] = await db<{ value: Partial<PublicFeatureConfig> }[]>`
    SELECT value
    FROM website_configs
    WHERE key = 'features'
  `
  const features = parseFeatureConfig(row?.value)

  return {
    registration: features?.registration === true,
    writer_application: features?.writer_application === true,
    comments: features?.comments === true,
  }
}

export async function isFeatureEnabled(feature: keyof PublicFeatureConfig): Promise<boolean> {
  const features = await getPublicFeatureConfig()
  return features[feature]
}
