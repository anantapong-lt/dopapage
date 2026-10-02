import { db } from '../../db'

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
