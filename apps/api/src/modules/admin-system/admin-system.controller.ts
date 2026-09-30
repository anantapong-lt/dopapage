import { status } from 'elysia'
import { getSystemMetrics } from './admin-system.service'

export async function loadSystemMetrics() {
  try {
    return await getSystemMetrics()
  } catch (error) {
    console.error('Unable to load system metrics', error)
    return status(500, { message: 'ไม่สามารถโหลดสถานะระบบได้ กรุณาลองใหม่อีกครั้ง' })
  }
}
