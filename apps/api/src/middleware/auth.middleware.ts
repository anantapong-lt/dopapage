import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { env } from '../config/env'
import type { UserRole } from '../models/user.model'
import { findActiveUserById, validateAuthSession } from '../modules/auth/auth.service'

const REFRESH_COOKIE_NAME = env.COOKIE_SECURE ? '__Host-refresh_token' : 'refresh_token'

function bearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null

  const token = authorization.slice(7).trim()
  return token || null
}

export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .use(
    jwt({
      name: 'accessJwt',
      secret: env.JWT_ACCESS_SECRET,
      exp: '15m',
    }),
  )
  .use(
    jwt({
      name: 'optionalRefreshJwt',
      secret: env.JWT_REFRESH_SECRET,
      exp: '7d',
    }),
  )
  .macro({
    optionalAuth: (enabled: boolean) => enabled ? ({
      async resolve({ accessJwt, cookie, optionalRefreshJwt, request }) {
        const token = bearerToken(request.headers.get('authorization'))
        const payload = token ? await accessJwt.verify(token) : false

        if (payload && payload.token_type === 'access' && typeof payload.sub === 'string') {
          return { currentUser: await findActiveUserById(payload.sub) ?? null }
        }

        const refreshToken = cookie[REFRESH_COOKIE_NAME].value
        if (typeof refreshToken !== 'string') return { currentUser: null }

        const refreshPayload = await optionalRefreshJwt.verify(refreshToken)
        if (
          !refreshPayload
          || refreshPayload.token_type !== 'refresh'
          || typeof refreshPayload.sub !== 'string'
          || typeof refreshPayload.jti !== 'string'
          || typeof refreshPayload.sid !== 'string'
        ) {
          return { currentUser: null }
        }

        const sessionIsValid = await validateAuthSession(
          refreshPayload.sid,
          refreshPayload.sub,
          refreshPayload.jti,
        )
        if (!sessionIsValid) return { currentUser: null }

        return { currentUser: await findActiveUserById(refreshPayload.sub) ?? null }
      },
    }) : {},
    auth: (requiredRole: true | UserRole | UserRole[]) => ({
      async resolve({ accessJwt, request, status }) {
        const token = bearerToken(request.headers.get('authorization'))
        const payload = token ? await accessJwt.verify(token) : false

        if (!payload || payload.token_type !== 'access' || typeof payload.sub !== 'string') {
          return status(401, { message: 'กรุณาเข้าสู่ระบบ' })
        }

        const currentUser = await findActiveUserById(payload.sub)
        if (!currentUser) {
          return status(401, { message: 'ไม่พบบัญชีผู้ใช้ที่พร้อมใช้งาน' })
        }

        const hasRequiredRole = requiredRole === true
          || (Array.isArray(requiredRole)
            ? requiredRole.includes(currentUser.role)
            : currentUser.role === requiredRole)
        if (!hasRequiredRole) {
          return status(403, { message: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' })
        }

        return { currentUser }
      },
    }),
  })
