function required(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function requiredSecret(name: string): string {
  const value = required(name)

  if (value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`)
  }

  return value
}

const nodeEnv = process.env.NODE_ENV ?? 'development'

export const isDev = nodeEnv === 'development'

function requiredTmweasyApiUrl(): string {
  const value = required('TMWEASY_API_URL')
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error('TMWEASY_API_URL must be a valid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('TMWEASY_API_URL must use HTTP or HTTPS')
  }

  if (!isDev && url.protocol !== 'https:') {
    throw new Error('TMWEASY_API_URL must use HTTPS outside development')
  }

  return url.toString()
}

function requiredPromptpayType(): '01' | '02' {
  const value = required('TMWEASY_PROMPTPAY_TYPE')

  if (value !== '01' && value !== '02') {
    throw new Error('TMWEASY_PROMPTPAY_TYPE must be 01 or 02')
  }

  return value
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase()

  if (!value) return fallback
  if (value === 'true') return true
  if (value === 'false') return false

  throw new Error(`${name} must be true or false`)
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT ?? 3001),
  API_ORIGIN: process.env.API_ORIGIN?.trim() ?? `http://localhost:${process.env.PORT ?? 3001}`,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN ?? 'http://localhost:3002',
  COOKIE_SECURE: booleanEnvironment('COOKIE_SECURE', nodeEnv === 'production'),
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: process.env.REDIS_URL?.trim() ?? 'redis://localhost:6379',
  JWT_ACCESS_SECRET: requiredSecret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: requiredSecret('JWT_REFRESH_SECRET'),
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() ?? '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL?.trim() ?? '',
  EMAIL_VERIFICATION_TTL_HOURS: positiveInteger('EMAIL_VERIFICATION_TTL_HOURS', 24),
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY?.trim() ?? '',
  BOOST_SMS_API_KEY: process.env.BOOST_SMS_API_KEY?.trim() ?? '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
  GOOGLE_OAUTH_CALLBACK_URL: process.env.GOOGLE_OAUTH_CALLBACK_URL?.trim() ?? '',
  LOCAL_UPLOAD: (process.env.local_upload ?? process.env.LOCAL_UPLOAD)?.trim().toLowerCase() === 'true',
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID?.trim() ?? '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID?.trim() ?? '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? '',
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME?.trim() ?? '',
  R2_MANGA_BUCKET_NAME: process.env.R2_MANGA_BUCKET_NAME?.trim() ?? '',
  R2_TRANSFER_PROOF_BUCKET_NAME: process.env.R2_TRANSFER_PROOF_BUCKET_NAME?.trim() ?? '',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL?.trim() ?? '',
  TMWEASY_API_URL: requiredTmweasyApiUrl(),
  TMWEASY_USERNAME: required('TMWEASY_USERNAME'),
  TMWEASY_PASSWORD: required('TMWEASY_PASSWORD'),
  TMWEASY_CON_ID: required('TMWEASY_CON_ID'),
  TMWEASY_API_KEY: required('TMWEASY_API_KEY'),
  TMWEASY_PROMPTPAY_ID: required('TMWEASY_PROMPTPAY_ID'),
  TMWEASY_PROMPTPAY_TYPE: requiredPromptpayType(),
} as const
