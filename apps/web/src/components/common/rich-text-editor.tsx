'use client'

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Extension, mergeAttributes, Node, type Editor } from '@tiptap/core'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  Heading2Icon,
  ImagePlusIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const lineHeightOptions = [
  { value: 'normal', label: 'ปกติ' },
  { value: '1', label: '1.0' },
  { value: '1.5', label: '1.5' },
  { value: '2', label: '2.0' },
] as const

const inlineStyleProperties = [
  'font-family',
  'font-size',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
] as const

const blockStyleProperties = [
  ...inlineStyleProperties,
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'text-indent',
] as const

const formattingStyleProperties = [
  ...blockStyleProperties,
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
] as const

const allowedPasteElements = new Set([
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DEL',
  'EM',
  'FONT',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'IMG',
  'LI',
  'OL',
  'P',
  'PRE',
  'S',
  'SPAN',
  'STRIKE',
  'STRONG',
  'U',
  'UL',
])

const removedPasteElements = new Set([
  'APPLET',
  'AUDIO',
  'BUTTON',
  'EMBED',
  'FORM',
  'IFRAME',
  'INPUT',
  'MATH',
  'OBJECT',
  'SCRIPT',
  'SELECT',
  'STYLE',
  'SVG',
  'TEXTAREA',
  'VIDEO',
])

const blockPasteElements = new Set([
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'OL',
  'P',
  'PRE',
  'UL',
])

type AllowedStyleProperty = typeof formattingStyleProperties[number]

function isSafeStyleValue(property: AllowedStyleProperty, value: string): boolean {
  const normalized = value.trim()
  if (!normalized || normalized.length > 200) return false
  if (/url\s*\(|expression\s*\(|(?:var|calc|attr)\s*\(/i.test(normalized)) return false
  if (/[{}<>\\]/.test(normalized)) return false

  if (property === 'text-align') {
    return ['left', 'center', 'right', 'justify', 'start', 'end'].includes(normalized.toLowerCase())
  }

  if (property === 'font-weight') {
    return /^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(normalized)
  }

  if (property === 'font-style') {
    return /^(?:normal|italic|oblique(?:\s+-?(?:\d+|\d*\.\d+)deg)?)$/i.test(normalized)
  }

  if (property === 'text-decoration') {
    return /^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i.test(normalized)
  }

  if (property === 'font-family') {
    return !/[;:]/.test(normalized) && !/[\u0000-\u001f\u007f]/.test(normalized)
  }

  if (property === 'font-size') {
    if (/^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i.test(normalized)) {
      return true
    }
  }

  if (property === 'color' || property === 'background-color') {
    return typeof CSS === 'undefined' || CSS.supports(property, normalized)
  }

  if (property === 'line-height' && normalized.toLowerCase() === 'normal') return true
  if (property === 'letter-spacing' && normalized.toLowerCase() === 'normal') return true

  const allowNegative = ['letter-spacing', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'text-indent']
    .includes(property)
  const numericPattern = allowNegative
    ? /^-?(?:\d+|\d*\.\d+)(?:px|pt|pc|em|rem|%|in|cm|mm|q)?$/i
    : /^(?:\d+|\d*\.\d+)(?:px|pt|pc|em|rem|%|in|cm|mm|q)?$/i

  return numericPattern.test(normalized)
}

function copyAllowedStyles(
  source: CSSStyleDeclaration,
  target: CSSStyleDeclaration,
  overwrite: boolean,
) {
  for (const property of formattingStyleProperties) {
    const value = source.getPropertyValue(property)
    if (!isSafeStyleValue(property, value)) continue
    if (!overwrite && target.getPropertyValue(property)) continue
    target.setProperty(property, value.trim())
  }

  const decorationLine = source.getPropertyValue('text-decoration-line')
  if (
    isSafeStyleValue('text-decoration', decorationLine)
    && (overwrite || !target.getPropertyValue('text-decoration'))
  ) {
    target.setProperty('text-decoration', decorationLine.trim())
  }
}

function resolveClassBasedStyles(parsedDocument: Document) {
  const sourceCss = Array.from(parsedDocument.querySelectorAll('style'))
    .map((styleElement) => styleElement.textContent ?? '')
    .join('\n')
    .replace(/@import[\s\S]*?;/gi, '')
    .replace(/url\s*\([^)]*\)/gi, '')

  if (!sourceCss.trim()) return
  if (typeof CSSStyleSheet === 'undefined' || !('replaceSync' in CSSStyleSheet.prototype)) return

  try {
    const stylesheet = new CSSStyleSheet()
    stylesheet.replaceSync(sourceCss)

    for (const rule of Array.from(stylesheet.cssRules)) {
      if (rule.type !== CSSRule.STYLE_RULE) continue

      const styleRule = rule as CSSStyleRule
      const selectors = styleRule.selectorText
        .split(',')
        .map((selector) => selector.trim())
        .filter((selector) => /^(?:[a-z][\w-]*)?(?:\.[\w-]+)+$/i.test(selector))

      for (const selector of selectors) {
        for (const element of Array.from(parsedDocument.querySelectorAll<HTMLElement>(selector))) {
          copyAllowedStyles(styleRule.style, element.style, false)
        }
      }
    }
  } catch {
    // Invalid or browser-specific Office CSS should not block the paste action.
  }
}

function replaceElementTag(element: HTMLElement, tagName: 'p' | 'span'): HTMLElement {
  const replacement = element.ownerDocument.createElement(tagName)
  for (const attribute of Array.from(element.attributes)) {
    replacement.setAttribute(attribute.name, attribute.value)
  }
  replacement.append(...Array.from(element.childNodes))
  element.replaceWith(replacement)
  return replacement
}

function sanitizePastedElement(element: HTMLElement) {
  if (removedPasteElements.has(element.tagName)) {
    element.remove()
    return
  }

  let normalizedElement = element
  if (element.tagName === 'FONT') {
    const face = element.getAttribute('face')
    const color = element.getAttribute('color')
    if (face && isSafeStyleValue('font-family', face)) element.style.fontFamily = face
    if (color && isSafeStyleValue('color', color)) element.style.color = color
    normalizedElement = replaceElementTag(element, 'span')
  } else if (element.tagName === 'DIV') {
    const containsBlock = Array.from(element.children)
      .some((child) => blockPasteElements.has(child.tagName) || ['OL', 'UL', 'PRE'].includes(child.tagName))
    if (!containsBlock) normalizedElement = replaceElementTag(element, 'p')
  }

  if (!allowedPasteElements.has(normalizedElement.tagName)) {
    normalizedElement.replaceWith(...Array.from(normalizedElement.childNodes))
    return
  }

  if (normalizedElement.tagName === 'IMG') {
    const source = normalizedElement.getAttribute('src') ?? ''
    const alt = normalizedElement.getAttribute('alt')?.slice(0, 255) ?? ''
    const displayWidth = normalizedElement.getAttribute('data-image-display-width') ?? ''
    const align = normalizedElement.getAttribute('data-image-align') ?? ''
    const isSafeSource = isSafeEmbeddedImageSource(source)

    for (const attribute of Array.from(normalizedElement.attributes)) {
      normalizedElement.removeAttribute(attribute.name)
    }
    if (!isSafeSource) {
      normalizedElement.remove()
      return
    }

    normalizedElement.setAttribute('src', source)
    normalizedElement.setAttribute('alt', alt)
    if (/^\d{2,4}$/.test(displayWidth)) {
      normalizedElement.setAttribute('data-image-display-width', displayWidth)
    }
    if (['left', 'center', 'right'].includes(align)) {
      normalizedElement.setAttribute('data-image-align', align)
    }
    return
  }

  const originalStyle = normalizedElement.style
  const safeStyle = normalizedElement.ownerDocument.createElement('span').style
  copyAllowedStyles(originalStyle, safeStyle, true)

  const direction = normalizedElement.getAttribute('dir')?.toLowerCase()
  const listStart = normalizedElement.tagName === 'OL'
    ? normalizedElement.getAttribute('start')
    : null

  for (const attribute of Array.from(normalizedElement.attributes)) {
    normalizedElement.removeAttribute(attribute.name)
  }

  if (safeStyle.cssText) normalizedElement.setAttribute('style', safeStyle.cssText)
  if (direction === 'ltr' || direction === 'rtl' || direction === 'auto') {
    normalizedElement.setAttribute('dir', direction)
  }
  if (listStart && /^\d+$/.test(listStart)) normalizedElement.setAttribute('start', listStart)

  if (!blockPasteElements.has(normalizedElement.tagName) && normalizedElement.tagName !== 'SPAN') {
    const inlineStyle = normalizedElement.ownerDocument.createElement('span').style
    for (const property of inlineStyleProperties) {
      const value = safeStyle.getPropertyValue(property)
      if (value) inlineStyle.setProperty(property, value)
      normalizedElement.style.removeProperty(property)
    }

    if (inlineStyle.cssText && normalizedElement.childNodes.length > 0) {
      const styleWrapper = normalizedElement.ownerDocument.createElement('span')
      styleWrapper.setAttribute('style', inlineStyle.cssText)
      styleWrapper.append(...Array.from(normalizedElement.childNodes))
      normalizedElement.append(styleWrapper)
    }

    if (!normalizedElement.style.cssText) normalizedElement.removeAttribute('style')
  }
}

function getParagraphStyleValue(
  paragraph: HTMLParagraphElement,
  property: typeof blockStyleProperties[number],
): string {
  const paragraphValue = paragraph.style.getPropertyValue(property)
  if (paragraphValue) return paragraphValue

  for (const styledChild of Array.from(paragraph.querySelectorAll<HTMLElement>('[style]'))) {
    const childValue = styledChild.style.getPropertyValue(property)
    if (childValue) return childValue
  }

  return ''
}

function inheritBlankParagraphStyles(parsedDocument: Document) {
  const paragraphs = Array.from(parsedDocument.body.querySelectorAll<HTMLParagraphElement>('p'))

  for (const [index, paragraph] of paragraphs.entries()) {
    if (paragraph.textContent?.trim()) continue

    const previousParagraph = paragraphs
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.textContent?.trim())
    const nextParagraph = paragraphs
      .slice(index + 1)
      .find((candidate) => candidate.textContent?.trim())

    for (const property of blockStyleProperties) {
      if (paragraph.style.getPropertyValue(property)) continue

      const contextualValue = (
        previousParagraph && getParagraphStyleValue(previousParagraph, property)
      ) || (
        nextParagraph && getParagraphStyleValue(nextParagraph, property)
      ) || ''

      if (isSafeStyleValue(property, contextualValue)) {
        paragraph.style.setProperty(property, contextualValue.trim())
      }
    }
  }
}

function normalizePastedHtml(html: string): string {
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html')
  resolveClassBasedStyles(parsedDocument)

  for (const element of Array.from(parsedDocument.body.querySelectorAll<HTMLElement>('*'))) {
    sanitizePastedElement(element)
  }
  inheritBlankParagraphStyles(parsedDocument)

  const commentWalker = parsedDocument.createTreeWalker(parsedDocument.body, NodeFilter.SHOW_COMMENT)
  const comments: Comment[] = []
  while (commentWalker.nextNode()) comments.push(commentWalker.currentNode as Comment)
  for (const comment of comments) comment.remove()

  return parsedDocument.body.innerHTML
}

function getNodeStyles(node: ProseMirrorNode) {
  const block = document.createElement('span').style
  const inline = document.createElement('span').style
  let capturedInlineStyle = false

  if (typeof node.attrs.blockStyle === 'string') {
    block.cssText = node.attrs.blockStyle
  }

  node.descendants((child) => {
    if (capturedInlineStyle) return false

    const textStyle = child.marks.find((mark) => mark.type.name === 'textStyle')
    if (!textStyle) return true

    const attributeProperties = [
      ['fontFamily', 'font-family'],
      ['fontSize', 'font-size'],
      ['lineHeight', 'line-height'],
      ['letterSpacing', 'letter-spacing'],
      ['color', 'color'],
      ['backgroundColor', 'background-color'],
    ] as const

    for (const [attribute, property] of attributeProperties) {
      const value = textStyle.attrs[attribute]
      if (typeof value === 'string' && isSafeStyleValue(property, value)) {
        inline.setProperty(property, value)
      }
    }

    capturedInlineStyle = true
    return false
  })

  return { block, inline }
}

function normalizePastedSlice(slice: Slice): Slice {
  const nodes: ProseMirrorNode[] = []
  slice.content.forEach((node) => nodes.push(node))

  const normalizedNodes = nodes.flatMap((node, index) => {
    if (node.type.name !== 'paragraph' || node.textContent.trim()) return [node]

    const previousNode = nodes
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.textContent.trim())
    const nextNode = nodes
      .slice(index + 1)
      .find((candidate) => candidate.textContent.trim())
    const previousStyles = previousNode ? getNodeStyles(previousNode) : null
    const nextStyles = nextNode ? getNodeStyles(nextNode) : null
    const paragraphStyle = document.createElement('span').style

    for (const property of blockStyleProperties) {
      const value = (
        previousStyles?.block.getPropertyValue(property)
        || nextStyles?.block.getPropertyValue(property)
        || previousStyles?.inline.getPropertyValue(property)
        || nextStyles?.inline.getPropertyValue(property)
        || ''
      )

      if (isSafeStyleValue(property, value)) {
        paragraphStyle.setProperty(property, value.trim())
      }
    }

    let explicitRowCount = 0
    node.content.forEach((child) => {
      if (child.type.name === 'hardBreak') explicitRowCount += 1
    })

    const rowCount = Math.max(1, explicitRowCount)
    const attributes = {
      ...node.attrs,
      blockStyle: paragraphStyle.cssText || node.attrs.blockStyle,
      direction: node.attrs.direction
        || previousNode?.attrs.direction
        || nextNode?.attrs.direction
        || null,
    }

    return Array.from(
      { length: rowCount },
      () => node.type.create(attributes, Fragment.empty, node.marks),
    )
  })

  return new Slice(Fragment.fromArray(normalizedNodes), slice.openStart, slice.openEnd)
}

declare module '@tiptap/extension-text-style' {
  interface TextStyleAttributes {
    letterSpacing?: string | null
  }
}

const LetterSpacing = Extension.create({
  name: 'letterSpacing',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) => (
              attributes.letterSpacing
                ? { style: `letter-spacing: ${attributes.letterSpacing}` }
                : {}
            ),
          },
        },
      },
    ]
  },
})

function getBlockStyle(element: HTMLElement): string | null {
  const declarations = element.ownerDocument.createElement('span').style
  for (const property of blockStyleProperties) {
    const value = element.style.getPropertyValue(property)
    if (isSafeStyleValue(property, value)) declarations.setProperty(property, value.trim())
  }
  return declarations.cssText || null
}

const BlockFormatting = Extension.create({
  name: 'blockFormatting',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'listItem', 'bulletList', 'orderedList', 'codeBlock'],
        attributes: {
          blockStyle: {
            default: null,
            parseHTML: (element) => getBlockStyle(element),
            renderHTML: (attributes) => attributes.blockStyle
              ? { style: attributes.blockStyle }
              : {},
          },
          direction: {
            default: null,
            parseHTML: (element) => element.getAttribute('dir'),
            renderHTML: (attributes) => attributes.direction
              ? { dir: attributes.direction }
              : {},
          },
        },
      },
    ]
  },
})

const SpanParagraph = Node.create({
  name: 'paragraph',
  priority: 1000,
  group: 'block',
  content: 'inline*',
  parseHTML() {
    return [
      { tag: 'p' },
      { tag: 'span[data-type="paragraph"]' },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'paragraph',
        style: 'display: block',
      }),
      0,
    ]
  },
  addCommands() {
    return {
      setParagraph: () => ({ commands }) => commands.setNode(this.name),
    }
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setParagraph(),
    }
  },
})

type ResizeDirection = 'left' | 'right'

interface ImageResizeState {
  direction: ResizeDirection
  startX: number
  startWidth: number
  maxWidth: number
}

function ChapterImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeStateRef = useRef<ImageResizeState | null>(null)
  const previewWidthRef = useRef<number | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)
  const storedWidth = Number(node.attrs.displayWidth) || null
  const displayWidth = previewWidth ?? storedWidth
  const align = ['left', 'center', 'right'].includes(node.attrs.align)
    ? node.attrs.align
    : 'center'

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: ResizeDirection,
  ) => {
    const image = imageRef.current
    const container = containerRef.current
    if (!image || !container) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const renderedWidth = image.getBoundingClientRect().width
    const availableWidth = container.parentElement?.getBoundingClientRect().width ?? renderedWidth
    const maxWidth = Math.min(image.naturalWidth || renderedWidth, availableWidth)
    resizeStateRef.current = {
      direction,
      startX: event.clientX,
      startWidth: renderedWidth,
      maxWidth,
    }
    previewWidthRef.current = renderedWidth
    setPreviewWidth(renderedWidth)
  }

  const resizeImage = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = resizeStateRef.current
    if (!state) return
    const delta = state.direction === 'right'
      ? event.clientX - state.startX
      : state.startX - event.clientX
    const minWidth = Math.min(48, state.maxWidth)
    const nextWidth = Math.min(state.maxWidth, Math.max(minWidth, state.startWidth + delta))
    previewWidthRef.current = nextWidth
    setPreviewWidth(nextWidth)
  }

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = resizeStateRef.current
    if (!state) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const nextWidth = previewWidthRef.current ?? state.startWidth
    updateAttributes({
      displayWidth: nextWidth >= state.maxWidth - 1 ? null : Math.round(nextWidth),
    })
    resizeStateRef.current = null
    previewWidthRef.current = null
    setPreviewWidth(null)
  }

  const justifyContent = align === 'left'
    ? 'flex-start'
    : align === 'right'
      ? 'flex-end'
      : 'center'

  return (
    <NodeViewWrapper
      className="my-4 flex w-full"
      style={{ justifyContent }}
      data-image-align={align}
    >
      <div
        ref={containerRef}
        className={`relative max-w-full ${selected ? 'ring-2 ring-primary' : ''}`}
        style={{ width: displayWidth ? `${displayWidth}px` : 'fit-content' }}
        contentEditable={false}
      >
        <img
          ref={imageRef}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ''}
          draggable={false}
          className="block h-auto max-w-full rounded-lg"
          style={{ width: displayWidth ? '100%' : 'auto' }}
        />
        {selected ? (
          <>
            {([
              ['top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize', 'left'],
              ['top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize', 'right'],
              ['bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize', 'left'],
              ['right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize', 'right'],
            ] as const).map(([positionClass, direction]) => (
              <button
                key={positionClass}
                type="button"
                aria-label="ลากเพื่อปรับขนาดรูปภาพ"
                className={`absolute z-10 size-3 touch-none rounded-sm border-2 border-background bg-primary shadow-sm ${positionClass}`}
                onPointerDown={(event) => startResize(event, direction)}
                onPointerMove={resizeImage}
                onPointerUp={finishResize}
                onPointerCancel={finishResize}
              />
            ))}
          </>
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}

const ChapterImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      displayWidth: {
        default: null,
        parseHTML: (element) => {
          const width = Number(element.getAttribute('data-image-display-width'))
          return Number.isInteger(width) && width >= 48 && width <= 5000 ? width : null
        },
        renderHTML: (attributes) => attributes.displayWidth
          ? { 'data-image-display-width': attributes.displayWidth }
          : {},
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-image-align') || 'center',
        renderHTML: (attributes) => ({ 'data-image-align': attributes.align }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'img[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const displayWidth = Number(HTMLAttributes['data-image-display-width'])
    const align = HTMLAttributes['data-image-align']
    const margins = align === 'left'
      ? 'margin-left: 0; margin-right: auto;'
      : align === 'right'
        ? 'margin-left: auto; margin-right: 0;'
        : 'margin-left: auto; margin-right: auto;'
    return ['img', mergeAttributes(HTMLAttributes, {
      class: 'my-4 h-auto max-w-full rounded-lg',
      draggable: 'true',
      style: `display: block; width: ${displayWidth ? `${displayWidth}px` : 'auto'}; max-width: 100%; height: auto; ${margins}`,
    })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChapterImageView)
  },
})

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_IMAGES = 4

function isSafeEmbeddedImageSource(source: string): boolean {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(source)
  if (!match) return false
  const encoded = match[1].replace(/\s/g, '')
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return encoded.length > 0 && Math.floor(encoded.length * 3 / 4) - padding <= MAX_IMAGE_SIZE
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Invalid image result'))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'))
    reader.readAsDataURL(file)
  })
}

function countEditorImages(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') count += 1
  })
  return count
}

export interface RichTextEditorProps {
  id?: string
  initialContent?: string
  name?: string
  onChange?: (html: string) => void
  contentClassName?: string
}

interface EditorButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function EditorButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: EditorButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </Button>
  )
}

export function RichTextEditor({
  id = 'rich-text-editor',
  initialContent = '',
  name = 'content',
  onChange,
  contentClassName,
}: RichTextEditorProps) {
  const [html, setHtml] = useState(initialContent)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageCount, setImageCount] = useState(0)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ paragraph: false, underline: false }),
      SpanParagraph,
      TextStyleKit,
      LetterSpacing,
      BlockFormatting,
      ChapterImage,
      TextAlign.configure({ types: ['heading', 'paragraph', 'blockquote', 'listItem'] }),
      Underline,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        id,
        class: `min-h-96 whitespace-pre-wrap px-4 py-3 text-sm leading-7 outline-none [tab-size:4] ${contentClassName ?? ''}`,
      },
      transformPastedHTML: normalizePastedHtml,
      transformPasted: normalizePastedSlice,
    },
    onCreate: ({ editor: currentEditor }) => {
      setImageCount(countEditorImages(currentEditor))
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextHtml = currentEditor.getHTML()
      setHtml(nextHtml)
      setImageCount(countEditorImages(currentEditor))
      onChange?.(nextHtml)
    },
  })

  const validateImage = (file: File) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setImageError('รองรับเฉพาะไฟล์ JPG, PNG และ WebP')
      return false
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('รูปภาพแต่ละไฟล์ต้องมีขนาดไม่เกิน 5 MB')
      return false
    }
    return true
  }

  const currentImageCount = () => {
    return editor ? countEditorImages(editor) : imageCount
  }

  const imageNodeFromFile = async (file: File) => {
    if (!validateImage(file)) return null
    try {
      return {
        type: 'image',
        attrs: { src: await readImageAsDataUrl(file), alt: file.name },
      }
    } catch {
      setImageError('ไม่สามารถอ่านไฟล์รูปภาพได้ กรุณาลองใหม่อีกครั้ง')
      return null
    }
  }

  const insertImageFiles = async (files: File[], position?: number) => {
    if (!editor) return
    const availableSlots = MAX_IMAGES - currentImageCount()
    if (availableSlots <= 0) {
      setImageError(`แทรกรูปภาพได้ไม่เกิน ${MAX_IMAGES} รูปต่อตอน`)
      return
    }
    const exceedsLimit = files.length > availableSlots
    if (exceedsLimit) {
      setImageError(`แทรกรูปภาพได้ไม่เกิน ${MAX_IMAGES} รูปต่อตอน`)
    }

    const images = (await Promise.all(files.slice(0, availableSlots).map(imageNodeFromFile)))
      .filter((image) => image !== null)
    if (!images.length) return
    if (!exceedsLimit && images.length === files.length) setImageError(null)
    const chain = editor.chain().focus()
    if (position === undefined) chain.insertContent(images).run()
    else chain.insertContentAt(position, images).run()
  }

  const handleImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    void insertImageFiles(Array.from(event.target.files ?? []), editor?.state.selection.from)
    event.target.value = ''
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editor) return
    const clipboard = event.clipboardData
    const htmlContent = clipboard.getData('text/html')
    const clipboardImages = Array.from(clipboard.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .flatMap((item) => item.getAsFile() ?? [])
    if (!clipboardImages.length && !/<img\b/i.test(htmlContent)) return

    event.preventDefault()
    event.stopPropagation()
    const insertionPosition = editor.state.selection.from

    if (!htmlContent) {
      void insertImageFiles(clipboardImages, insertionPosition)
      return
    }

    void (async () => {
      setImageError(null)
      const parsedDocument = new DOMParser().parseFromString(htmlContent, 'text/html')
      const imageElements = Array.from(parsedDocument.body.querySelectorAll<HTMLImageElement>('img'))
      const availableSlots = Math.max(0, MAX_IMAGES - currentImageCount())
      let clipboardImageIndex = 0
      let retainedImageCount = 0

      for (const imageElement of imageElements) {
        if (retainedImageCount >= availableSlots) {
          imageElement.remove()
          continue
        }

        const source = imageElement.getAttribute('src') ?? ''
        if (isSafeEmbeddedImageSource(source)) {
          if (clipboardImages[clipboardImageIndex]) clipboardImageIndex += 1
          retainedImageCount += 1
          continue
        }

        const file = clipboardImages[clipboardImageIndex++]
        if (!file || !validateImage(file)) {
          imageElement.remove()
          continue
        }
        try {
          imageElement.setAttribute('src', await readImageAsDataUrl(file))
          imageElement.setAttribute('alt', imageElement.getAttribute('alt') || file.name)
          retainedImageCount += 1
        } catch {
          imageElement.remove()
          setImageError('ไม่สามารถอ่านไฟล์รูปภาพจาก Word ได้ กรุณาลองแทรกรูปด้วยปุ่มรูปภาพ')
        }
      }

      for (const remainingFile of clipboardImages.slice(clipboardImageIndex, clipboardImageIndex + availableSlots - retainedImageCount)) {
        if (!validateImage(remainingFile)) continue
        try {
          const imageElement = parsedDocument.createElement('img')
          imageElement.setAttribute('src', await readImageAsDataUrl(remainingFile))
          imageElement.setAttribute('alt', remainingFile.name)
          parsedDocument.body.append(imageElement)
          retainedImageCount += 1
        } catch {
          setImageError('ไม่สามารถอ่านไฟล์รูปภาพจาก Word ได้ กรุณาลองแทรกรูปด้วยปุ่มรูปภาพ')
        }
      }

      if (Math.max(imageElements.length, clipboardImages.length) > availableSlots) {
        setImageError(`แทรกรูปภาพได้ไม่เกิน ${MAX_IMAGES} รูปต่อตอน`)
      }
      editor.chain().focus().insertContentAt(
        insertionPosition,
        normalizePastedHtml(parsedDocument.body.innerHTML),
      ).run()
    })()
  }

  const imageIsSelected = editor?.isActive('image') ?? false
  const imageLimitReached = imageCount >= MAX_IMAGES
  const selectedImageAlign = String(editor?.getAttributes('image').align ?? 'center')

  const setAlignment = (alignment: 'left' | 'center' | 'right') => {
    if (!editor) return
    if (imageIsSelected) {
      editor.chain().focus().updateAttributes('image', { align: alignment }).run()
      return
    }
    editor.chain().focus().setTextAlign(alignment).run()
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
      onPasteCapture={handlePaste}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-2">
        <EditorButton
          label="หัวข้อ"
          active={editor?.isActive('heading', { level: 2 })}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2Icon />
        </EditorButton>
        <EditorButton
          label="ตัวหนา"
          active={editor?.isActive('bold')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </EditorButton>
        <EditorButton
          label="ตัวเอียง"
          active={editor?.isActive('italic')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </EditorButton>
        <EditorButton
          label="ขีดเส้นใต้"
          active={editor?.isActive('underline')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </EditorButton>
        <EditorButton
          label="ขีดทับ"
          active={editor?.isActive('strike')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </EditorButton>
        <span className="mx-1 h-6 w-px bg-border" />
        {imageLimitReached ? (
          <span className="inline-flex cursor-not-allowed" title={`เพิ่มรูปภาพได้สูงสุด ${MAX_IMAGES} รูปต่อตอน`}>
                <span className="inline-flex cursor-not-allowed" tabIndex={0}>
                  <EditorButton
                    label="แทรกรูปภาพ"
                    disabled
                    onClick={() => undefined}
                  >
                    <ImagePlusIcon />
                  </EditorButton>
                </span>
              <span className="sr-only">
                เพิ่มรูปภาพได้สูงสุด {MAX_IMAGES} รูปต่อตอน
              </span>
          </span>
        ) : (
          <EditorButton
            label="แทรกรูปภาพ"
            disabled={!editor}
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlusIcon />
          </EditorButton>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          aria-label="เลือกรูปภาพประกอบ"
          onChange={handleImageInput}
        />
        <span className="mx-1 h-6 w-px bg-border" />
        <EditorButton
          label="รายการหัวข้อย่อย"
          active={editor?.isActive('bulletList')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </EditorButton>
        <EditorButton
          label="รายการแบบลำดับเลข"
          active={editor?.isActive('orderedList')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </EditorButton>
        <EditorButton
          label="ข้อความอ้างอิง"
          active={editor?.isActive('blockquote')}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon />
        </EditorButton>
        <span className="mx-1 h-6 w-px bg-border" />
        <EditorButton
          label="จัดชิดซ้าย"
          active={imageIsSelected ? selectedImageAlign === 'left' : editor?.isActive({ textAlign: 'left' })}
          disabled={!editor}
          onClick={() => setAlignment('left')}
        >
          <AlignLeftIcon />
        </EditorButton>
        <EditorButton
          label="จัดกึ่งกลาง"
          active={imageIsSelected ? selectedImageAlign === 'center' : editor?.isActive({ textAlign: 'center' })}
          disabled={!editor}
          onClick={() => setAlignment('center')}
        >
          <AlignCenterIcon />
        </EditorButton>
        <EditorButton
          label="จัดชิดขวา"
          active={imageIsSelected ? selectedImageAlign === 'right' : editor?.isActive({ textAlign: 'right' })}
          disabled={!editor}
          onClick={() => setAlignment('right')}
        >
          <AlignRightIcon />
        </EditorButton>
        <span className="mx-1 h-6 w-px bg-border" />
        <Select
          value={String(
            editor?.getAttributes('textStyle').lineHeight
              ?? 'normal',
          )}
          onValueChange={(value) => {
            if (!editor) return

            if (!value || value === 'normal') {
              editor.chain().focus().unsetLineHeight().run()
              return
            }

            editor.chain().focus().setLineHeight(value).run()
          }}
          disabled={!editor}
        >
          <SelectTrigger
            className="h-8! w-28 rounded-lg px-2"
            aria-label="ระยะห่างบรรทัด"
            title="ระยะห่างบรรทัด"
          >
            <span className="text-xs text-muted-foreground">บรรทัด</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lineHeightOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="mx-1 h-6 w-px bg-border" />
        <EditorButton
          label="ย้อนกลับ"
          disabled={!editor?.can().chain().focus().undo().run()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2Icon />
        </EditorButton>
        <EditorButton
          label="ทำซ้ำ"
          disabled={!editor?.can().chain().focus().redo().run()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2Icon />
        </EditorButton>
      </div>

      <EditorContent
        editor={editor}
        className="[&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-4 [&_.tiptap_h2]:my-3 [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-bold [&_.tiptap_ol]:my-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_p]:my-2 [&_.tiptap_ul]:my-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6"
      />
      {imageError ? <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive">{imageError}</p> : null}
      <input type="hidden" name={name} value={html} />
    </div>
  )
}
