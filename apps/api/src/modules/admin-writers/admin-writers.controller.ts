import { status } from 'elysia'
import type { adminWriterStatusBodySchema, adminWritersQuerySchema, updateAdminWriterBodySchema } from './admin-writers.schema'
import { countAdminWriters, findAdminWriters, updateAdminWriter, updateAdminWriterStatus } from './admin-writers.service'
import { WRITER_STATUS } from '../../models/user.model'

function normalizePhoneNumber(value: string | null | undefined) {
  const phoneNumber = value?.trim() ?? ''
  if (!phoneNumber) return null
  return /^0[0-9]{9}$/.test(phoneNumber) ? `+66${phoneNumber.slice(1)}` : phoneNumber
}

export async function getAdminWriters(query: typeof adminWritersQuerySchema.static) {
  try {
    const limit = query.limit ?? 20
    const search = query.search?.trim() ?? ''
    const selectedStatus = query.status ?? null
    const total = await countAdminWriters(search, selectedStatus)
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const page = Math.min(query.page ?? 1, totalPages)
    const writers = await findAdminWriters(page, limit, search, selectedStatus)
    return { writers, pagination: { page, limit, total, totalPages } }
  } catch (error) {
    console.error('Unable to load admin writers', error)
    return status(500, { message: 'ไม่สามารถโหลดรายชื่อนักเขียนได้' })
  }
}

export async function changeAdminWriterStatus(id: string, body: typeof adminWriterStatusBodySchema.static) {
  const banReason = body.reason?.trim() ?? ''
  if (body.status !== WRITER_STATUS.ACTIVE && !banReason) {
    return status(400, { message: 'กรุณาระบุเหตุผลในการแบนผู้เขียน' })
  }

  try {
    const writer = await updateAdminWriterStatus(id, body.status, banReason || null)
    return writer ? { writer } : status(404, { message: 'ไม่พบนักเขียน' })
  } catch (error) {
    console.error('Unable to update admin writer status', error)
    return status(500, { message: 'ไม่สามารถเปลี่ยนสถานะนักเขียนได้' })
  }
}

export async function editAdminWriter(id: string, actorUserId: string, body: typeof updateAdminWriterBodySchema.static) {
  try {
    const writer = await updateAdminWriter(id, actorUserId, {
      displayName: body.display_name.trim(),
      phoneNumber: normalizePhoneNumber(body.phone_number),
      balance: body.balance,
    })
    return writer ? { writer } : status(404, { message: 'ไม่พบนักเขียน' })
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : null
    if (code === '23514') return status(400, { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณากรอกเบอร์ 10 หลัก เช่น 0812345678' })

    console.error('Unable to update admin writer', error)
    return status(500, { message: 'ไม่สามารถบันทึกข้อมูลนักเขียนได้ กรุณาลองใหม่อีกครั้ง' })
  }
}
