import { Elysia } from 'elysia'
import { authMiddleware } from '../../middleware/auth.middleware'
import { USER_ROLE } from '../../models/user.model'
import { loadAdminSiteConfig, updateAdminSiteConfig, uploadAdminSiteLogo, uploadAdminSiteFavicon } from './admin-site.controller'
import { adminSiteConfigBodySchema, adminSiteLogoBodySchema, adminSiteFaviconBodySchema } from './admin-site.schema'

export const adminSiteRoutes = new Elysia({ prefix: '/admin/site' })
  .use(authMiddleware)
  .get('/', () => loadAdminSiteConfig(), { auth: USER_ROLE.SUPER_ADMIN })
  .post('/favicon', ({ body }) => uploadAdminSiteFavicon(body), {
    auth: USER_ROLE.SUPER_ADMIN,
    body: adminSiteFaviconBodySchema,
  })
  .post('/logo', ({ body }) => uploadAdminSiteLogo(body), {
    auth: USER_ROLE.SUPER_ADMIN,
    body: adminSiteLogoBodySchema,
  })
  .put('/', ({ body }) => updateAdminSiteConfig(body), {
    auth: USER_ROLE.SUPER_ADMIN,
    body: adminSiteConfigBodySchema,
  })
