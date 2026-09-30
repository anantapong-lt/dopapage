import { status } from 'elysia'
import { getSystemMetrics } from './admin-system.service'
import { getSystemLogs } from './admin-system-log.service'
import type { adminSystemLogsQuerySchema } from './admin-system.schema'

export async function loadSystemMetrics() {
  try {
    return await getSystemMetrics()
  } catch (error) {
    console.error('Unable to load system metrics', error)
    return status(500, { message: 'ไม่สามารถโหลดสถานะระบบได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function loadSystemLogs(query: typeof adminSystemLogsQuerySchema.static) {
  try {
    return await getSystemLogs(query)
  } catch (error) {
    console.error('Unable to load system logs', error)
    return status(500, { message: 'ไม่สามารถโหลด API logs ได้ กรุณาลองใหม่อีกครั้ง' })
  }
}
