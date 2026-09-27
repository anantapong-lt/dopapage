export type ReadingTheme = 'light' | 'sepia' | 'gray' | 'sage' | 'dark'
export type ReadingFont = 'sans' | 'serif' | 'arial' | 'cordia-new' | 'tf-nopscript' | 'sarabun' | 'noto-serif-thai' | 'prompt' | 'layiji-mahaniyom'

export interface ReadingSettings {
  fontSize: number
  fontFamily: ReadingFont
  theme: ReadingTheme
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 18,
  fontFamily: 'sans',
  theme: 'light',
}

export const READING_THEMES: Record<ReadingTheme, { label: string; background: string; text: string }> = {
  light: { label: 'สว่าง', background: 'var(--card)', text: 'var(--foreground)' },
  sepia: { label: 'ครีม', background: 'var(--secondary)', text: 'var(--secondary-foreground)' },
  gray: { label: 'เทาอ่อน', background: '#e7e5e4', text: '#292524' },
  sage: { label: 'เขียวใบไม้', background: '#e5efe6', text: '#21352a' },
  dark: { label: 'มืด', background: '#000000', text: '#d1d5db' },
}

export const READING_FONTS: Record<ReadingFont, { label: string; family: string; weight?: number }> = {
  sans: { label: 'Noto Sans Thai', family: 'var(--font-sans)' },
  serif: { label: 'Georgia', family: 'Georgia, serif' },
  arial: { label: 'Arial', family: 'Arial, var(--font-sans)' },
  'cordia-new': { label: 'Cordia New', family: "'Cordia New', Cordia, var(--font-sans)" },
  'tf-nopscript': { label: 'TF NopScript Bold', family: "'TF NopScript', var(--font-sans)", weight: 700 },
  sarabun: { label: 'Sarabun', family: 'var(--font-sarabun)' },
  'noto-serif-thai': { label: 'Noto Serif Thai', family: 'var(--font-noto-serif-thai)' },
  prompt: { label: 'Prompt', family: 'var(--font-prompt)' },
  'layiji-mahaniyom': { label: 'Layiji มหานิยม', family: "'Layiji Mahaniyom', var(--font-sans)" },
}

const STORAGE_KEY = 'readji:reading-settings'
const DEFAULT_FONT_MIGRATION_KEY = 'readji:reading-settings:default-font-v2'

export function loadReadingSettings(): ReadingSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const shouldApplyDefaultFont = !window.localStorage.getItem(DEFAULT_FONT_MIGRATION_KEY)
    if (!stored) {
      if (shouldApplyDefaultFont) window.localStorage.setItem(DEFAULT_FONT_MIGRATION_KEY, '1')
      return DEFAULT_READING_SETTINGS
    }

    const parsed = JSON.parse(stored) as Partial<ReadingSettings>
    const fontSize = typeof parsed.fontSize === 'number' ? Math.min(32, Math.max(16, parsed.fontSize)) : DEFAULT_READING_SETTINGS.fontSize
    const fontFamily = parsed.fontFamily && parsed.fontFamily in READING_FONTS ? parsed.fontFamily : DEFAULT_READING_SETTINGS.fontFamily
    const theme = parsed.theme && parsed.theme in READING_THEMES ? parsed.theme : DEFAULT_READING_SETTINGS.theme

    if (shouldApplyDefaultFont) {
      window.localStorage.setItem(DEFAULT_FONT_MIGRATION_KEY, '1')
      return { fontSize, fontFamily: DEFAULT_READING_SETTINGS.fontFamily, theme }
    }

    return { fontSize, fontFamily, theme }
  } catch {
    return DEFAULT_READING_SETTINGS
  }
}

export function saveReadingSettings(settings: ReadingSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Reading preferences are optional and can safely fall back to defaults.
  }
}
