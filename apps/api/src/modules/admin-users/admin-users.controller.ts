import { status } from 'elysia'
import { countAdminUsers, findAdminUsers, updateAdminUser } from './admin-users.service'
import type { adminUsersQuerySchema, updateAdminUserBodySchema } from './admin-users.schema'

function normalizePhoneNumber(value: string | null | undefined) {
  const phoneNumber = value?.trim() ?? ''
  if (!phoneNumber) return null
  return /^0[0-9]{9}$/.test(phoneNumber) ? `+66${phoneNumber.slice(1)}` : phoneNumber
}

export async function getAdminUsers(query: typeof adminUsersQuerySchema.static) {
  try {
    const limit = query.limit ?? 20
    const search = query.search?.trim() ?? ''
    const selectedStatus = query.status ?? null
    const total = await countAdminUsers(search, selectedStatus)
    const totalPages = Math.ceil(total / limit)
    const page = Math.min(query.page ?? 1, Math.max(totalPages, 1))
    const users = await findAdminUsers(page, limit, search, selectedStatus)

    return { users, pagination: { page, limit, total, totalPages } }
  } catch (error) {
    console.error('Unable to load admin users', error)
    return status(500, { message: 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง' })
  }
}

export async function editAdminUser(id: string, actorUserId: string, body: typeof updateAdminUserBodySchema.static) {
  try {
    const user = await updateAdminUser(id, actorUserId, {
      displayName: body.display_name.trim(),
      username: body.username.trim(),
      email: body.email.trim().toLowerCase(),
      phoneNumber: normalizePhoneNumber(body.phone_number),
      status: body.status,
      balance: body.balance,
    })
    if (!user) return status(404, { message: 'ไม่พบผู้ใช้งาน' })
    return { user }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : null
    if (code === '23505') return status(409, { message: 'อีเมลหรือ Username นี้ถูกใช้งานแล้ว' })

    if (code === '23514') return status(400, { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณากรอกเบอร์ 10 หลัก เช่น 0812345678' })

    console.error('Unable to update admin user', error)
    return status(500, { message: 'ไม่สามารถบันทึกข้อมูลผู้ใช้งานได้ กรุณาลองใหม่อีกครั้ง' })
  }
}
