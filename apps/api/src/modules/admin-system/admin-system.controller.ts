import { status } from 'elysia'
import { getSystemMetrics } from './admin-system.service'
import { getSystemLogs } from './admin-system-log.service'

export async function loadSystemMetrics() {
  try {
    return await getSystemMetrics()
  } catch (error) {
    console.error('Unable to load system metrics', error)
    return status(500, { message: 'ไม่สามารถโหลดสถานะระบบได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export function loadSystemLogs() {
  return getSystemLogs()
}
