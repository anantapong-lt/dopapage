import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { env } from '../../config/env'
import { authMiddleware } from '../../middleware/auth.middleware'
import {
  confirmRegistrationEmail,
  registerWithEmail,
  requireLoginTurnstile,
} from './auth.controller'
import {
  googleAuthQuerySchema,
  changePasswordBodySchema,
  setPasswordBodySchema,
  unlinkGoogleBodySchema,
  phoneVerificationRequestBodySchema,
  phoneVerificationVerifyBodySchema,
  registrationPhoneRequestBodySchema,
  registrationPhoneVerifyBodySchema,
  googleCallbackQuerySchema,
  loginBodySchema,
  registerBodySchema,
  verifyEmailBodySchema,
} from './auth.schema'
import {
  authenticateWithPassword,
  createAuthSession,
  findActiveUserById,
  revokeAuthSession,
  validateAuthSession,
} from './auth.service'
import { beginGoogleAuthentication, finishGoogleAuthentication } from './google-auth.controller'
import { requestRegistrationPhoneResponse, startRegistrationPhoneResponse, verifyRegistrationPhoneResponse } from './registration-phone.controller'
import { accountSecurityResponse, accountSecuritySessionResponse, changePasswordResponse, requestPhoneVerificationResponse, setPasswordResponse, unlinkGoogleResponse, verifyPhoneVerificationResponse } from './account-security.controller'
import { agentLoginResponse, agentRefreshResponse } from './agent-auth.controller'
import { agentLoginBodySchema, agentRefreshBodySchema } from '../tts-agent/tts-agent.schema'

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60
const REFRESH_COOKIE_NAME = env.NODE_ENV === 'production' ? '__Host-refresh_token' : 'refresh_token'
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  // The Web/Admin deployments live on a different site from the API, so the
  // refresh cookie must be available to credentialed cross-origin requests.
  sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/',
}

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(authMiddleware)
  .use(
    jwt({
      name: 'refreshJwt',
      secret: env.JWT_REFRESH_SECRET,
      exp: '7d',
    }),
  )
  .get('/google', ({ cookie, query }) => beginGoogleAuthentication('login', query.next, cookie), {
    query: googleAuthQuerySchema,
  })
  .get('/google/register', ({ cookie, query }) => beginGoogleAuthentication('register', query.next, cookie), {
    query: googleAuthQuerySchema,
  })
  .get('/google/link', ({ cookie, currentUser }) => beginGoogleAuthentication('link', undefined, cookie, currentUser?.id), {
    optionalAuth: true,
  })
  .get('/security', ({ currentUser }) => accountSecurityResponse(currentUser.id), { auth: true })
  .get('/security/session', ({ currentUser }) => accountSecuritySessionResponse(currentUser?.id), { optionalAuth: true })
  .post('/security/password', ({ currentUser, body }) => changePasswordResponse(currentUser.id, body), {
    auth: true,
    body: changePasswordBodySchema,
  })
  .post('/security/password/set', ({ currentUser, body }) => setPasswordResponse(currentUser.id, body), {
    auth: true,
    body: setPasswordBodySchema,
  })
  .post('/security/google/unlink', ({ currentUser, body }) => unlinkGoogleResponse(currentUser.id, body), {
    auth: true,
    body: unlinkGoogleBodySchema,
  })
  .post('/security/phone/request', ({ currentUser, body }) => requestPhoneVerificationResponse(currentUser.id, body), {
    auth: true,
    body: phoneVerificationRequestBodySchema,
  })
  .post('/security/phone/verify', ({ currentUser, body }) => verifyPhoneVerificationResponse(currentUser.id, body), {
    auth: true,
    body: phoneVerificationVerifyBodySchema,
  })
  .post('/registration/phone/request', ({ body }) => requestRegistrationPhoneResponse(body), {
    body: registrationPhoneRequestBodySchema,
  })
  .post('/registration/phone/start', ({ body }) => startRegistrationPhoneResponse(body), {
    body: registrationPhoneRequestBodySchema,
  })
  .post('/registration/phone/verify', ({ body }) => verifyRegistrationPhoneResponse(body), {
    body: registrationPhoneVerifyBodySchema,
  })
  .get('/google/callback', ({ cookie, query, refreshJwt, currentUser }) => finishGoogleAuthentication(
    query,
    cookie,
    (claims) => refreshJwt.sign(claims),
    currentUser?.id,
  ), {
    query: googleCallbackQuerySchema,
    optionalAuth: true,
  })
  .post(
    '/register',
    async ({ accessJwt, body, cookie, refreshJwt, set }) => {
      const registration = await registerWithEmail(body)
      if (registration.status !== 201) return registration

      const result = await authenticateWithPassword(body.email, body.password, { allowUnverified: true })
      if (result.status !== 'authenticated') {
        set.status = 500
        return { message: 'สมัครสมาชิกสำเร็จ แต่ไม่สามารถเข้าสู่ระบบอัตโนมัติได้ กรุณาลองเข้าสู่ระบบอีกครั้ง' }
      }

      const claims = {
        sub: result.user.id,
        role: result.user.role,
      }
      const accessToken = await accessJwt.sign({
        ...claims,
        token_type: 'access',
      })
      const refreshTokenId = crypto.randomUUID()
      const sessionId = await createAuthSession(result.user.id, refreshTokenId)
      const refreshToken = await refreshJwt.sign({
        ...claims,
        jti: refreshTokenId,
        sid: sessionId,
        token_type: 'refresh',
      })

      cookie[REFRESH_COOKIE_NAME].set({
        value: refreshToken,
        ...REFRESH_COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      })

      return {
        message: 'สมัครสมาชิกสำเร็จ',
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        user: result.user,
      }
    },
    { body: registerBodySchema },
  )
  .post(
    '/verify-email',
    ({ body }) => confirmRegistrationEmail(body.token),
    { body: verifyEmailBodySchema },
  )
  .post(
    '/agent/login',
    ({ accessJwt, body, refreshJwt, request }) => agentLoginResponse(
      body,
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown',
      (claims) => accessJwt.sign(claims),
      (claims) => refreshJwt.sign(claims),
    ),
    { body: agentLoginBodySchema },
  )
  .post(
    '/agent/refresh',
    ({ accessJwt, body, refreshJwt }) => agentRefreshResponse(
      body.refresh_token,
      (claims) => accessJwt.sign(claims),
      (token) => refreshJwt.verify(token),
    ),
    { body: agentRefreshBodySchema },
  )
  .post(
    '/login',
    async ({ accessJwt, body, cookie, refreshJwt, set }) => {
      const result = await authenticateWithPassword(body.email, body.password, { allowUnverified: true })

      if (result.status === 'invalid_credentials') {
        set.status = 401
        return { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }
      }

      if (result.status === 'inactive') {
        set.status = 403
        return { message: 'บัญชีนี้ไม่สามารถเข้าใช้งานได้' }
      }

      if (result.status === 'unverified') {
        set.status = 403
        return { message: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ' }
      }

      const claims = {
        sub: result.user.id,
        role: result.user.role,
      }
      const accessToken = await accessJwt.sign({
        ...claims,
        token_type: 'access',
      })
      const refreshTokenId = crypto.randomUUID()
      const sessionId = await createAuthSession(result.user.id, refreshTokenId)
      const refreshToken = await refreshJwt.sign({
        ...claims,
        jti: refreshTokenId,
        sid: sessionId,
        token_type: 'refresh',
      })

      cookie[REFRESH_COOKIE_NAME].set({
        value: refreshToken,
        ...REFRESH_COOKIE_OPTIONS,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      })

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        user: result.user,
      }
    },
    {
      body: loginBodySchema,
      beforeHandle: ({ body }) => requireLoginTurnstile(body.turnstile_token),
    },
  )
  .post('/refresh', async ({ accessJwt, cookie, refreshJwt, set }) => {
    const refreshCookie = cookie[REFRESH_COOKIE_NAME]
    const refreshToken = refreshCookie.value

    if (typeof refreshToken !== 'string') {
      set.status = 401
      return { message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const payload = await refreshJwt.verify(refreshToken)
    if (
      !payload
      || payload.token_type !== 'refresh'
      || typeof payload.sub !== 'string'
      || typeof payload.jti !== 'string'
      || typeof payload.sid !== 'string'
    ) {
      refreshCookie.set({
        value: '',
        ...REFRESH_COOKIE_OPTIONS,
        expires: new Date(0),
        maxAge: 0,
      })
      set.status = 401
      return { message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const sessionIsValid = await validateAuthSession(
      payload.sid,
      payload.sub,
      payload.jti,
    )
    if (!sessionIsValid) {
      set.status = 401
      return { message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const user = await findActiveUserById(payload.sub)
    if (!user) {
      await revokeAuthSession(payload.sid, payload.sub)
      refreshCookie.set({
        value: '',
        ...REFRESH_COOKIE_OPTIONS,
        expires: new Date(0),
        maxAge: 0,
      })
      set.status = 401
      return { message: 'ไม่พบบัญชีผู้ใช้ที่พร้อมใช้งาน' }
    }

    const claims = { sub: user.id, role: user.role }
    const accessToken = await accessJwt.sign({
      ...claims,
      token_type: 'access',
    })
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      user,
    }
  })
  .get('/session', async ({ cookie, refreshJwt, set }) => {
    const refreshToken = cookie[REFRESH_COOKIE_NAME].value

    if (typeof refreshToken !== 'string') {
      set.status = 401
      return { message: 'กรุณาเข้าสู่ระบบ' }
    }

    const payload = await refreshJwt.verify(refreshToken)
    if (
      !payload
      || payload.token_type !== 'refresh'
      || typeof payload.sub !== 'string'
      || typeof payload.jti !== 'string'
      || typeof payload.sid !== 'string'
    ) {
      set.status = 401
      return { message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const sessionIsValid = await validateAuthSession(
      payload.sid,
      payload.sub,
      payload.jti,
    )
    if (!sessionIsValid) {
      set.status = 401
      return { message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }
    }

    const user = await findActiveUserById(payload.sub)
    if (!user) {
      set.status = 401
      return { message: 'ไม่พบบัญชีผู้ใช้ที่พร้อมใช้งาน' }
    }

    return { user }
  })
  .get('/me', ({ currentUser }) => ({ user: currentUser }), { auth: true })
  .post('/logout', async ({ cookie, refreshJwt }) => {
    const refreshCookie = cookie[REFRESH_COOKIE_NAME]
    const refreshToken = refreshCookie.value

    if (typeof refreshToken === 'string') {
      const payload = await refreshJwt.verify(refreshToken)
      if (payload && typeof payload.sid === 'string' && typeof payload.sub === 'string') {
        await revokeAuthSession(payload.sid, payload.sub)
      }
    }

    refreshCookie.set({
      value: '',
      ...REFRESH_COOKIE_OPTIONS,
      expires: new Date(0),
      maxAge: 0,
    })
    return { success: true }
  })
