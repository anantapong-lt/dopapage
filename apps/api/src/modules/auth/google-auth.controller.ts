import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env'
import { isFeatureEnabled } from '../site-config/site-config.service'
import { authenticateWithGoogle, createAuthSession } from './auth.service'
import { createGoogleAuthorizationUrl, getGoogleProfile, GoogleAuthError } from './google-auth.service'
import { linkGoogleAccount } from './account-security.service'

const STATE_COOKIE = env.COOKIE_SECURE ? '__Host-google_oauth_state' : 'google_oauth_state'
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60,
}

const SECURITY_PATH = '/profile?tab=security'
const REFRESH_COOKIE_NAME = env.COOKIE_SECURE ? '__Host-refresh_token' : 'refresh_token'

type OAuthMode = 'login' | 'register' | 'link'

type OAuthState = { state: string; verifier: string; next: string; mode: OAuthMode; userId?: string; expiresAt: number }

function stateSignature(value: string): Buffer {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(value).digest()
}

function readState(value: unknown): OAuthState | null {
  if (typeof value !== 'string') return null
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = stateSignature(payload)
  const actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString()) as OAuthState
    if (!state || typeof state.state !== 'string' || typeof state.verifier !== 'string'
      || typeof state.next !== 'string' || typeof state.expiresAt !== 'number' || state.expiresAt <= Date.now()
      || !['login', 'register', 'link'].includes(state.mode)
      || (state.mode === 'link' && typeof state.userId !== 'string')) return null
    return state
  } catch {
    return null
  }
}

function safeNext(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/'
}

function redirectToWeb(path: string, params: Record<string, string> = {}): Response {
  const url = new URL(path, env.WEB_ORIGIN)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return Response.redirect(url, 302)
}

export async function beginGoogleAuthentication(
  mode: OAuthMode,
  next: string | undefined,
  cookie: Record<string, any>,
  currentUserId?: string,
): Promise<Response> {
  if (mode === 'link' && !currentUserId) {
    return redirectToWeb('/login', { next: SECURITY_PATH, oauth_error: 'กรุณาเข้าสู่ระบบบัญชีเดิมก่อนเชื่อมบัญชี Google' })
  }
  const state = crypto.randomUUID()
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url')
  const value: OAuthState = {
    state, verifier, next: safeNext(next), mode,
    ...(mode === 'link' ? { userId: currentUserId } : {}),
    expiresAt: Date.now() + STATE_COOKIE_OPTIONS.maxAge * 1000,
  }
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  // Cookies must contain a token-safe value. Raw JSON includes quotes and braces,
  // which some browsers/proxies do not round-trip through an OAuth redirect.
  cookie[STATE_COOKIE].set({
    value: `${payload}.${stateSignature(payload).toString('base64url')}`,
    ...STATE_COOKIE_OPTIONS,
  })
  try {
    return Response.redirect(await createGoogleAuthorizationUrl(state, verifier), 302)
  } catch (error) {
    const message = error instanceof GoogleAuthError ? error.message : 'Google authentication is unavailable.'
    return redirectToWeb(mode === 'link' ? SECURITY_PATH : '/login', { oauth_error: message })
  }
}

export async function finishGoogleAuthentication(
  query: { code?: string; state?: string; error?: string },
  cookie: Record<string, any>,
  signRefreshToken: (claims: Record<string, string>) => Promise<string>,
  currentUserId?: string,
): Promise<Response> {
  const stateCookie = cookie[STATE_COOKIE]
  const rawState = stateCookie.value
  stateCookie.set({ value: '', ...STATE_COOKIE_OPTIONS, maxAge: 0, expires: new Date(0) })

  const savedState = readState(rawState)
  const next = safeNext(savedState?.next)
  const errorPath = savedState?.mode === 'link' ? SECURITY_PATH : '/login'
  if (!savedState || !query.state || savedState.state !== query.state || !query.code || query.error) {
    return redirectToWeb(errorPath, { oauth_error: 'การยืนยันบัญชี Google ถูกยกเลิกหรือหมดอายุ กรุณาลองใหม่อีกครั้ง' })
  }
  if (savedState.mode === 'link' && (!currentUserId || currentUserId !== savedState.userId)) {
    return redirectToWeb('/login', { next: SECURITY_PATH, oauth_error: 'กรุณาเข้าสู่ระบบบัญชีเดิมแล้วเริ่มเชื่อมบัญชี Google อีกครั้ง' })
  }

  try {
    const profile = await getGoogleProfile(query.code, savedState.verifier)
    if (savedState.mode === 'link') {
      const result = await linkGoogleAccount(currentUserId!, profile)
      if (result === 'linked') return redirectToWeb(SECURITY_PATH, { google_linked: '1' })
      const messages = {
        inactive: 'บัญชีนี้ไม่สามารถเข้าใช้งานได้',
        email_mismatch: 'กรุณาเลือกบัญชี Google ที่ใช้อีเมลเดียวกับบัญชีที่เข้าสู่ระบบอยู่',
        already_linked: 'บัญชีนี้หรือบัญชี Google ที่เลือกมีการเชื่อมต่ออยู่แล้ว',
      }
      return redirectToWeb(SECURITY_PATH, { oauth_error: messages[result] })
    }
    // Existing emails require an explicit link by the authenticated account owner.
    const result = await authenticateWithGoogle(
      profile,
      await isFeatureEnabled('registration'),
    )
    if ('status' in result) {
      if (result.status === 'email_exists') {
        return redirectToWeb('/login', {
          next: SECURITY_PATH,
          oauth_error: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบบัญชีเดิมก่อน จากนั้นไปที่ โปรไฟล์ > ความปลอดภัย เพื่อเชื่อมบัญชี Google',
        })
      }
      const message = result.status === 'inactive'
        ? 'This account is not available.'
        : 'New account registration is currently unavailable.'
      return redirectToWeb('/login', { oauth_error: message })
    }
    const refreshTokenId = crypto.randomUUID()
    const sessionId = await createAuthSession(result.user.id, refreshTokenId)
    const refreshToken = await signRefreshToken({
      sub: result.user.id, role: result.user.role, jti: refreshTokenId, sid: sessionId, token_type: 'refresh',
    })
    cookie[REFRESH_COOKIE_NAME].set({
      value: refreshToken, httpOnly: true, secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SECURE ? 'none' : 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
    })
    return redirectToWeb('/auth/google/callback', { next })
  } catch (error) {
    console.error('Google authentication failed', error)
    const message = error instanceof GoogleAuthError ? error.message : 'Google authentication failed. Please try again.'
    return redirectToWeb(errorPath, { oauth_error: message })
  }
}
