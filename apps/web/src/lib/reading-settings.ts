export type ReadingTheme = 'light' | 'sepia' | 'gray' | 'sage' | 'dark'
export type ReadingFont = 'sans' | 'serif' | 'arial' | 'cordia-new' | 'tf-nopscript' | 'sarabun' | 'noto-serif-thai' | 'prompt' | 'layiji-mahaniyom'

export interface ReadingSettings {
  fontSize: number
  fontFamily: ReadingFont
  theme: ReadingTheme
  autoNext: boolean
  autoPurchase: boolean
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 18,
  fontFamily: 'sans',
  theme: 'light',
  autoNext: true,
  autoPurchase: false,
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
