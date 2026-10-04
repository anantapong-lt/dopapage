import { status } from 'elysia'
import type { adminSiteConfigBodySchema, adminSiteLogoBodySchema, adminSiteFaviconBodySchema } from './admin-site.schema'
import { getAdminSiteConfig, saveAdminSiteConfig, uploadSiteLogo, uploadSiteFavicon, InvalidSiteLogoError } from './admin-site.service'

export async function loadAdminSiteConfig() {
  try {
    return await getAdminSiteConfig()
  } catch (error) {
    console.error('Unable to load admin site config', error)
    return status(500, { message: 'ไม่สามารถโหลดการตั้งค่าเว็บไซต์ได้' })
  }
}

export async function updateAdminSiteConfig(body: typeof adminSiteConfigBodySchema.static) {
  try {
    return await saveAdminSiteConfig(body)
  } catch (error) {
    console.error('Unable to save admin site config', error)
    return status(500, { message: 'ไม่สามารถบันทึกการตั้งค่าเว็บไซต์ได้' })
  }
}

export async function uploadAdminSiteLogo(body: typeof adminSiteLogoBodySchema.static) {
  try {
    return await uploadSiteLogo(body.logo)
  } catch (error) {
    if (error instanceof InvalidSiteLogoError) return status(400, { message: error.message })
    console.error('Unable to upload site logo', error)
    return status(500, { message: 'ไม่สามารถอัปโหลด Logo ได้ กรุณาลองอีกครั้ง' })
  }
}

export async function uploadAdminSiteFavicon(body: typeof adminSiteFaviconBodySchema.static) {
  try {
    return await uploadSiteFavicon(body.favicon)
  } catch (error) {
    if (error instanceof InvalidSiteLogoError) return status(400, { message: error.message })
    console.error('Unable to upload site favicon', error)
    return status(500, { message: 'ไม่สามารถอัปโหลด Favicon ได้ กรุณาลองอีกครั้ง' })
  }
}
