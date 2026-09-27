import { t } from 'elysia'

export const changePasswordBodySchema = t.Object({
  current_password: t.String({ minLength: 1, maxLength: 128 }),
  new_password: t.String({ minLength: 8, maxLength: 72 }),
  confirm_password: t.String({ minLength: 8, maxLength: 72 }),
}, { additionalProperties: false })

export type ChangePasswordBody = typeof changePasswordBodySchema.static

export const setPasswordBodySchema = t.Object({
  new_password: t.String({ minLength: 8, maxLength: 72 }),
  confirm_password: t.String({ minLength: 8, maxLength: 72 }),
}, { additionalProperties: false })

export type SetPasswordBody = typeof setPasswordBodySchema.static

export const unlinkGoogleBodySchema = t.Object({
  current_password: t.String({ minLength: 1, maxLength: 128 }),
}, { additionalProperties: false })

export type UnlinkGoogleBody = typeof unlinkGoogleBodySchema.static

export const phoneVerificationRequestBodySchema = t.Object({
  phone_number: t.String({ pattern: '^0[689][0-9]{8}$', maxLength: 10 }),
  turnstile_token: t.Optional(t.String({ maxLength: 2048 })),
}, { additionalProperties: false })

export type PhoneVerificationRequestBody = typeof phoneVerificationRequestBodySchema.static

export const phoneVerificationVerifyBodySchema = t.Object({
  phone_number: t.String({ pattern: '^0[689][0-9]{8}$', maxLength: 10 }),
  otp: t.String({ pattern: '^[0-9]{6}$', maxLength: 6 }),
}, { additionalProperties: false })

export type PhoneVerificationVerifyBody = typeof phoneVerificationVerifyBodySchema.static

export const registrationPhoneRequestBodySchema = t.Object({
  phone_number: t.String({ pattern: '^0[689][0-9]{8}$', maxLength: 10 }),
  turnstile_token: t.Optional(t.String({ maxLength: 2048 })),
}, { additionalProperties: false })

export const registrationPhoneVerifyBodySchema = t.Object({
  verification_id: t.String({ format: 'uuid' }),
  otp: t.String({ pattern: '^[0-9]{6}$', maxLength: 6 }),
}, { additionalProperties: false })

export const googleAuthQuerySchema = t.Object(
  {
    next: t.Optional(t.String({ maxLength: 2048 })),
  },
  { additionalProperties: false },
)

export const googleCallbackQuerySchema = t.Object({
  code: t.Optional(t.String({ maxLength: 4096 })),
  state: t.Optional(t.String({ maxLength: 512 })),
  error: t.Optional(t.String({ maxLength: 256 })),
}, { additionalProperties: true })

export const loginBodySchema = t.Object(
  {
    email: t.String({ format: 'email', maxLength: 320 }),
    password: t.String({ minLength: 1, maxLength: 128 }),
    turnstile_token: t.Optional(t.String({ maxLength: 2048 })),
  },
  { additionalProperties: false },
)

export const registerBodySchema = t.Object(
  {
    username: t.String({ minLength: 3, maxLength: 30 }),
    email: t.String({ format: 'email', maxLength: 320 }),
    phone_number: t.String({ pattern: '^0[689][0-9]{8}$' }),
    password: t.String({ minLength: 8, maxLength: 72 }),
    turnstile_token: t.Optional(t.String({ maxLength: 2048 })),
  },
  { additionalProperties: false },
)

export const verifyEmailBodySchema = t.Object(
  {
    token: t.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false },
)
