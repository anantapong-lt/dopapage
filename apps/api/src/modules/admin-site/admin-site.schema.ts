import { t } from 'elysia'

const topupPackageSchema = t.Object({
  amount: t.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?$', maxLength: 20 }),
  bonus: t.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?$', maxLength: 20 }),
})

export const adminSiteConfigBodySchema = t.Object({
  site: t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    tagline: t.String({ maxLength: 255 }),
    description: t.String({ maxLength: 1000 }),
    site_url: t.String({ format: 'uri', maxLength: 500 }),
    coin_name: t.String({ minLength: 1, maxLength: 50 }),
    logo_key: t.Optional(t.String({ pattern: '^(?:local/)?site/logos/[a-f0-9-]+\\.webp$', maxLength: 100 })),
    favicon_key: t.Optional(t.String({ pattern: '^(?:local/)?site/favicons/[a-f0-9-]+\\.png$', maxLength: 100 })),
  }),
  topup: t.Object({
    packages: t.Array(topupPackageSchema, { maxItems: 30 }),
  }),
  withdrawal: t.Object({
    commission_percent: t.String({ pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?$', maxLength: 6 }),
  }),
  features: t.Object({
    registration: t.Boolean(),
    writer_application: t.Boolean(),
    comments: t.Boolean(),
    topup: t.Boolean(),
    withdrawals: t.Boolean(),
  }),
}, { additionalProperties: false })

export const adminSiteLogoBodySchema = t.Object({
  logo: t.File({ type: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 5 * 1024 * 1024 }),
})

export const adminSiteFaviconBodySchema = t.Object({
  favicon: t.File({ type: ['image/png', 'image/jpeg', 'image/webp'], maxSize: 5 * 1024 * 1024 }),
})
