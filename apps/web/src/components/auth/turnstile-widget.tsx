'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      theme: 'auto'
      language: string
      callback: (token: string) => void
      'error-callback': () => void
      'expired-callback': () => void
      'timeout-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export function TurnstileWidget({
  action,
  onTokenChange,
}: {
  action: 'register' | 'login' | 'phone_verification' | 'password_reset'
  onTokenChange: (token: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!scriptReady || !siteKey || !containerRef.current || !window.turnstile) return

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: 'auto',
      language: 'th',
      callback: (token) => onTokenChange(token),
      'error-callback': () => onTokenChange(null),
      'expired-callback': () => onTokenChange(null),
      'timeout-callback': () => onTokenChange(null),
    })

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
      }
      widgetIdRef.current = null
    }
  }, [action, onTokenChange, scriptReady, siteKey])

  if (process.env.NODE_ENV === 'development') return null

  if (!siteKey) {
    return (
      <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
        ยังไม่ได้ตั้งค่า Cloudflare Turnstile
      </p>
    )
  }

  return (
    <div className="flex min-h-16 w-full items-center justify-center">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} />
    </div>
  )
}
