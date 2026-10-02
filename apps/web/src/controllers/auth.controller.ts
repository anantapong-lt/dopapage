import { apiRequest } from '@/lib/api-client'
import type { AuthSession } from '@/interface/auth-session.interface'
import type { AuthUser } from '@/interface/user.interface'
import type { AccountSecurity, ChangePasswordInput, PhoneVerificationInput, SetPasswordInput } from '@/interface/account-security.interface'

export function requestPhoneVerification(phoneNumber: string, accessToken: string, turnstileToken?: string): Promise<{ message: string }> {
  return apiRequest('/auth/security/phone/request', {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone_number: phoneNumber,
      ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
    }),
  })
}

export function verifyPhoneVerification(input: Required<PhoneVerificationInput>, accessToken: string): Promise<{ message: string; phone_number: string }> {
  return apiRequest('/auth/security/phone/verify', {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function changePassword(input: ChangePasswordInput, accessToken: string): Promise<{ message: string }> {
  return apiRequest('/auth/security/password', {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function setPassword(input: SetPasswordInput, accessToken: string): Promise<{ message: string }> {
  return apiRequest('/auth/security/password/set', {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function unlinkGoogleAccount(currentPassword: string, accessToken: string): Promise<{ message: string }> {
  return apiRequest('/auth/security/google/unlink', {
    method: 'POST',
    accessToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword }),
  })
}

export function getAccountSecurity(accessToken: string): Promise<{ account: AccountSecurity }> {
  return apiRequest('/auth/security', { accessToken })
}

export interface RegisterWithPasswordInput {
  username: string
  email: string
  phone_number: string
  password: string
  turnstile_token?: string
}

export function requestRegistrationPhoneVerification(phoneNumber: string, turnstileToken?: string): Promise<{ message: string; verification_id: string; expires_in: number }> {
  return apiRequest('/auth/registration/phone/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }),
  })
}

export function startRegistrationPhoneVerification(phoneNumber: string, turnstileToken?: string): Promise<{ message: string; verification_id: string; expires_in: number }> {
  return apiRequest('/auth/registration/phone/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }),
  })
}

export function verifyRegistrationPhoneVerification(verificationId: string, otp: string): Promise<{ message: string; verification_token: string }> {
  return apiRequest('/auth/registration/phone/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verification_id: verificationId, otp }),
  })
}

export function registerWithPassword(
  input: RegisterWithPasswordInput,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function verifyRegistrationEmail(token: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export function loginWithPassword(
  email: string,
  password: string,
  turnstileToken?: string,
): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
    }),
  })
}

export function requestPasswordReset(email: string, turnstileToken?: string): Promise<{ message: string; reset_id: string; masked_phone_number?: string }> {
  return apiRequest('/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }),
  })
}

export function verifyPasswordReset(resetId: string, otp: string): Promise<{ message: string; reset_token: string }> {
  return apiRequest('/auth/password-reset/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset_id: resetId, otp }),
  })
}

export function confirmPasswordReset(resetId: string, resetToken: string, newPassword: string, confirmPassword: string): Promise<{ message: string }> {
  return apiRequest('/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset_id: resetId, reset_token: resetToken, new_password: newPassword, confirm_password: confirmPassword }),
  })
}

export function refreshAuthSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/refresh', { method: 'POST' })
}

export function logoutAuthSession(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('/auth/logout', { method: 'POST' })
}

export function getCurrentUser(accessToken: string): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>('/auth/me', {
    accessToken,
  })
}
