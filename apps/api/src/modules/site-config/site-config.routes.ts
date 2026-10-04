import { Elysia } from 'elysia'
import { loadPublicFeatureConfig, loadPublicTopupConfig, loadPublicBrandingConfig } from './site-config.controller'

export const siteConfigRoutes = new Elysia({ prefix: '/site-config' })
  .get('/branding', () => loadPublicBrandingConfig())
  .get('/features', () => loadPublicFeatureConfig())
  .get('/topup', () => loadPublicTopupConfig())
