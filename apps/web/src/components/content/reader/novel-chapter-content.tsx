'use client'

import { useEffect, useState } from 'react'
import type { ReadingSettings } from '@/lib/reading-settings'
import { READING_FONTS, READING_THEMES } from '@/lib/reading-settings'
import { ReaderContentSkeleton } from './reader-content-skeleton'
import { useReaderContentProtection } from './use-reader-content-protection'

const BLOCKED_ELEMENTS = 'script,style,iframe,object,embed,form,input,button,textarea,select,meta,link,base,svg,math,audio,video,source,canvas'
const SAFE_ATTRIBUTES = new Set(['data-type', 'dir', 'start', 'style'])
const SAFE_IMAGE_ATTRIBUTES = new Set(['src', 'alt', 'data-image-display-width', 'data-image-align'])
const SAFE_STYLE_PROPERTIES = new Set([
  'display',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'min-height',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'text-indent',
])

function isSafeStyleValue(value: string) {
  return value.length <= 200
    && !/(?:@import|behavior|expression|javascript|[-]moz-binding|url)\s*\(/i.test(value)
    && !/[<>\u0000]/.test(value)
}

function isSafeChapterImageSource(value: string) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(value)
  if (!match) return false
  const encoded = match[1].replace(/\s/g, '')
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return encoded.length > 0 && Math.floor(encoded.length * 3 / 4) - padding <= 5 * 1024 * 1024
}

function sanitizeChapterHtml(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('a').forEach((element) => element.replaceWith(...element.childNodes))
  document.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove())

  let imageCount = 0
  document.body.querySelectorAll('*').forEach((element) => {
    if (element.tagName === 'IMG') {
      imageCount += 1
      if (imageCount > 4 || !isSafeChapterImageSource(element.getAttribute('src') ?? '')) {
        element.remove()
        return
      }
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const allowedAttributes = element.tagName === 'IMG' ? SAFE_IMAGE_ATTRIBUTES : SAFE_ATTRIBUTES

      if (!allowedAttributes.has(name)) {
        element.removeAttribute(attribute.name)
        continue
      }

    }

    if (element.tagName === 'IMG') {
      element.setAttribute('loading', 'lazy')
      element.setAttribute('decoding', 'async')
      element.setAttribute('draggable', 'false')
    }

    const style = (element as HTMLElement).style
    for (const property of [...style]) {
      if (!SAFE_STYLE_PROPERTIES.has(property) || !isSafeStyleValue(style.getPropertyValue(property).trim())) {
        style.removeProperty(property)
      }
    }

    if (element.matches('span[data-type="paragraph"]')) {
      style.display = 'block'
      if (!style.minHeight) style.minHeight = '1lh'
    }

    if (element.tagName === 'IMG') {
      const parsedWidth = Number(element.getAttribute('data-image-display-width'))
      const align = element.getAttribute('data-image-align')
      style.display = 'block'
      style.width = Number.isInteger(parsedWidth) && parsedWidth >= 48 && parsedWidth <= 5000
        ? `${parsedWidth}px`
        : 'auto'
      style.maxWidth = '100%'
      style.height = 'auto'
      style.marginLeft = align === 'left' ? '0' : 'auto'
      style.marginRight = align === 'right' ? '0' : 'auto'
    }
  })

  const paragraphSelector = 'p, span[data-type="paragraph"]'
  for (const paragraph of Array.from(document.body.querySelectorAll<HTMLElement>(paragraphSelector))) {
    const previous = paragraph.previousElementSibling
    paragraph.style.removeProperty('text-indent')
    if (
      previous?.matches(paragraphSelector)
      && !previous.textContent?.trim()
      && paragraph.style.textAlign !== 'center'
    ) {
      paragraph.style.textIndent = '2em'
    }
  }

  return document.body.innerHTML
}

export function NovelChapterContent({
  content,
  settings,
}: {
  content: string
  settings: ReadingSettings
}) {
  const { isProduction, preventInteraction } = useReaderContentProtection({ replaceNovelCopy: true })
  const [sanitizedContent, setSanitizedContent] = useState<{
    source: string
    html: string
  } | null>(null)
  const theme = READING_THEMES[settings.theme]
  const safeContent = sanitizedContent?.source === content
    ? sanitizedContent.html
    : null

  useEffect(() => {
    setSanitizedContent({
      source: content,
      html: sanitizeChapterHtml(content),
    })
  }, [content])

  return (
    <article
      className="px-4 py-8 transition-colors sm:px-10 sm:py-12 lg:px-16"
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      {safeContent === null ? (
        <ReaderContentSkeleton />
      ) : (
        <div
          className="relative"
          onContextMenu={preventInteraction}
          onDragStart={preventInteraction}
        >
          <div
            className="mx-auto max-w-3xl select-none break-words [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/35 [&_blockquote]:pl-4 [&_h1]:my-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:my-5 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:my-4 [&_h3]:text-xl [&_h3]:font-bold [&_hr]:my-8 [&_img]:mx-auto [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:min-h-[1lh] [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7"
            style={{
              fontFamily: READING_FONTS[settings.fontFamily].family,
              fontWeight: READING_FONTS[settings.fontFamily].weight,
              fontSize: settings.fontSize,
              lineHeight: 2,
            }}
            dangerouslySetInnerHTML={{ __html: safeContent }}
          />
          {isProduction ? (
            <div
              aria-hidden
              className="absolute inset-0 z-10 cursor-text"
              onContextMenu={preventInteraction}
              onDragStart={preventInteraction}
            />
          ) : null}
        </div>
      )}
    </article>
  )
}
