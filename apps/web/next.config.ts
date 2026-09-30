import type { NextConfig } from 'next'

function trustedHttpOrigin(value: string | undefined): string | null {
  if (!value || value.startsWith('/')) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    // A malformed environment value should not turn into a CSP source.
    return null
  }
}

function trustedPublicMediaUrl(value: string | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    // R2's S3 endpoint, access keys, or a URL carrying credentials must never
    // become a browser allowlist entry. Only a normal HTTPS public media host
    // is appropriate for CSP and next/image.
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

function trustedR2S3Origin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || !url.hostname.endsWith('.r2.cloudflarestorage.com')
    ) return null
    return url.origin
  } catch {
    return null
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const apiOrigin = trustedHttpOrigin(process.env.NEXT_PUBLIC_API_URL)
  ?? (isProduction ? null : 'http://localhost:4000')
const apiImageRemotePattern = apiOrigin
  ? (() => {
      const url = new URL(apiOrigin)
      return {
        protocol: url.protocol.slice(0, -1) as 'http' | 'https',
        hostname: url.hostname,
        port: url.port,
        pathname: '/**',
      }
    })()
  : null
const isSecureDeployment = isProduction && process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://')
const apiWebSocketOrigin = apiOrigin
  ? apiOrigin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  : null
const publicMediaUrl = trustedPublicMediaUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_URL)
const publicMediaOrigin = publicMediaUrl?.origin
const privateMangaR2Origin = trustedR2S3Origin(process.env.NEXT_PUBLIC_R2_MANGA_S3_ENDPOINT)
const publicMediaRemotePattern = publicMediaUrl
  ? {
      protocol: 'https' as const,
      hostname: publicMediaUrl.hostname,
      port: publicMediaUrl.port,
      pathname: '/**',
    }
  : null
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: blob: https://images.unsplash.com https://lh3.googleusercontent.com${apiOrigin ? ` ${apiOrigin}` : ''}${publicMediaOrigin ? ` ${publicMediaOrigin}` : ''}${privateMangaR2Origin ? ` ${privateMangaR2Origin}` : ''}`,
  `media-src 'self' blob:${apiOrigin ? ` ${apiOrigin}` : ''}${publicMediaOrigin ? ` ${publicMediaOrigin}` : ''}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isProduction ? '' : " 'unsafe-eval'"}`,
  `connect-src 'self' https://challenges.cloudflare.com${apiOrigin ? ` ${apiOrigin}` : ''}${apiWebSocketOrigin ? ` ${apiWebSocketOrigin}` : ''}`,
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isSecureDeployment ? ['upgrade-insecure-requests'] : []),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ...(isSecureDeployment
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['@readji/shared'],
  experimental: {
    proxyClientMaxBodySize: '650mb',
  },
  // ngrok's public development host is a different origin from localhost.
  // Allow it to load Next.js dev resources during this closed beta.
  allowedDevOrigins: ['unsightly-surrogate-rehab.ngrok-free.dev'],
  // เอาไว้เทสผ่าน ngrok — ถ้าตั้ง NEXT_PUBLIC_API_URL=/api ไว้ (ดู .env.local) เบราว์เซอร์จะยิงมาที่
  // origin เดียวกับตัวเว็บเสมอ แล้ว Next.js proxy ต่อให้ backend เอง (server-to-server ไม่มี
  // CORS/cross-site cookie ให้ต้องแก้) — ไม่กระทบ dev ปกติเพราะไม่มีใครเรียก /api/* ถ้าไม่ตั้ง env ตัวนี้
  async rewrites() {
    const apiHost = process.env.API_INTERNAL_URL || 'http://localhost:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiHost}/:path*`,
      },
    ]
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [40, 60, 75],
    remotePatterns: [
      // Unsplash — ใช้ตอน mock data
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      // Google account avatars returned by the OpenID Connect userinfo endpoint.
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      // Local assets are served by the API in VPS deployments. Keep this
      // restricted to the configured API origin rather than allowing all hosts.
      ...(apiImageRemotePattern ? [apiImageRemotePattern] : []),
      // Public R2/custom-media host from env only. Do not allow every R2
      // bucket: NEXT_PUBLIC_R2_PUBLIC_URL is the exact host returned by API.
      ...(publicMediaRemotePattern ? [publicMediaRemotePattern] : []),
    ],
  },
}

export default nextConfig
