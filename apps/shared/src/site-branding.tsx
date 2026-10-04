'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type Branding = { logo_url: string | null; favicon_url: string | null }
type BrandingContext = {
  logoUrl: string | null
  faviconUrl: string | null
  loading: boolean
  updateBranding: (branding: Branding) => void
}

const SiteBrandingContext = createContext<BrandingContext | null>(null)
// Memory only: shared across mounts and Strict Mode, reset on a full page load.
const requests = new Map<string, Promise<Branding>>()

function loadBranding(apiUrl: string): Promise<Branding> {
  let request = requests.get(apiUrl)
  if (!request) {
    request = fetch(`${apiUrl}/site-config/branding`, { cache: 'no-store', credentials: 'omit' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load site branding')
        const data = await response.json() as Branding
        return {
          logo_url: typeof data.logo_url === 'string' ? data.logo_url : null,
          favicon_url: typeof data.favicon_url === 'string' ? data.favicon_url : null,
        }
      })
      .catch(() => ({ logo_url: null, favicon_url: null }))
    requests.set(apiUrl, request)
  }
  return request
}

export function SiteBrandingProvider({ apiUrl, children }: { apiUrl: string; children: ReactNode }) {
  const baseUrl = apiUrl.replace(/\/+$/, '')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const revision = useRef(0)

  useEffect(() => {
    let active = true
    const initialRevision = revision.current
    void loadBranding(baseUrl).then((branding) => {
      if (!active || revision.current !== initialRevision) return
      setLogoUrl(branding.logo_url)
      setFaviconUrl(branding.favicon_url)
      setLoading(false)
    })
    return () => { active = false }
  }, [baseUrl])

  const updateBranding = useCallback((branding: Branding) => {
    revision.current += 1
    requests.set(baseUrl, Promise.resolve(branding))
    setLogoUrl(branding.logo_url)
    setFaviconUrl(branding.favicon_url)
    setLoading(false)
  }, [baseUrl])

  useEffect(() => {
    if (!faviconUrl) return
    const iconUrl = faviconUrl
    const originalAttributes = new Map<HTMLLinkElement, (string | null)[]>()
    const attributes = ['href', 'type', 'sizes'] as const
    let ownedIcon: HTMLLinkElement | null = null

    function applyFavicon() {
      const icons = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
      if (icons.length === 0) {
        ownedIcon = document.createElement('link')
        ownedIcon.rel = 'icon'
        document.head.appendChild(ownedIcon)
        icons.push(ownedIcon)
      }
      for (const icon of icons) {
        if (icon !== ownedIcon && !originalAttributes.has(icon)) {
          originalAttributes.set(icon, attributes.map((attribute) => icon.getAttribute(attribute)))
        }
        const values = [iconUrl, 'image/png', '48x48']
        attributes.forEach((attribute, index) => {
          if (icon.getAttribute(attribute) !== values[index]) icon.setAttribute(attribute, values[index])
        })
      }
    }

    applyFavicon()
    // Next can restore file-based icon metadata during navigation. Reuse the
    // already-loaded URL when that happens; never request branding again.
    const observer = new MutationObserver(applyFavicon)
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'rel', 'type', 'sizes'] })
    return () => {
      observer.disconnect()
      ownedIcon?.remove()
      originalAttributes.forEach((values, icon) => {
        if (!icon.isConnected) return
        attributes.forEach((attribute, index) => {
          const value = values[index]
          if (value === null) icon.removeAttribute(attribute)
          else icon.setAttribute(attribute, value)
        })
      })
    }
  }, [faviconUrl])

  const value = useMemo(() => ({ logoUrl, faviconUrl, loading, updateBranding }), [logoUrl, faviconUrl, loading, updateBranding])
  return <SiteBrandingContext.Provider value={value}>{children}</SiteBrandingContext.Provider>
}

export function useSiteBranding() {
  const context = useContext(SiteBrandingContext)
  if (!context) throw new Error('SiteBrandingProvider is required')
  return context
}

export function SiteLogo({ className, fallback, alt = 'Dopapage' }: {
  className: string
  fallback: ReactNode
  alt?: string
}) {
  const { logoUrl, loading } = useSiteBranding()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (loading) return <span className={className} aria-hidden="true" />
  if (!logoUrl || failedUrl === logoUrl) return <>{fallback}</>
  return <img src={logoUrl} alt={alt} className={className} style={{ objectFit: 'contain' }} onError={() => setFailedUrl(logoUrl)} />
}
