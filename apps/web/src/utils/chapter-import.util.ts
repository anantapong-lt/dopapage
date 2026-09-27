import { Unzip, UnzipInflate } from 'fflate'
import type { ImportedChapter } from '@/interface/writer-chapter-import.interface'

export const CHAPTER_IMPORT_MAX_BYTES = 100 * 1024 * 1024

function chapterNameParts(value: string): { chapterNumber: string; title: string } {
  const match = /^\s*(?:ตอนที่\s*)?(\d+(?:\.\d+)?)(?:\s+(.+?))?\s*$/.exec(value)
  return {
    chapterNumber: match?.[1] ?? '',
    title: match?.[2]?.trim() ?? '',
  }
}

export async function readChapterZip(file: File): Promise<ImportedChapter[]> {
  if (!/\.zip$/i.test(file.name)) throw new Error('กรุณาเลือกไฟล์ ZIP')
  if (file.size > CHAPTER_IMPORT_MAX_BYTES) throw new Error('ไฟล์ ZIP ต้องมีขนาดไม่เกิน 100MB')
  const rows: ImportedChapter[] = []
  let total = 0
  let completed = 0
  const unzip = new Unzip((entry) => {
    if (entry.name.endsWith('/') || entry.name.startsWith('__MACOSX/') || entry.name.split('/').pop()?.startsWith('._')) return
    if (rows.length >= 500) throw new Error('นำเข้าได้สูงสุด 500 ตอน')
    const filename = entry.name.split(/[\\/]/).pop() ?? entry.name
    const { chapterNumber, title } = chapterNameParts(filename.replace(/\.txt$/i, ''))
    const row: ImportedChapter = {
      id: crypto.randomUUID(), filename, title,
      chapter_number: chapterNumber,
      price: '', status: 'published', published_at: '', content: '',
    }
    rows.push(row)
    if (!/\.txt$/i.test(filename)) {
      row.readError = 'รองรับเฉพาะไฟล์ .txt กรุณาลบรายการนี้'
      completed++
      return
    }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const parts: string[] = []
    entry.ondata = (error, data, final) => {
      if (error) {
        row.readError = 'ไม่สามารถแตกไฟล์นี้ได้: ' + error.message
        completed++
        return
      }
      total += data.length
      if (total > CHAPTER_IMPORT_MAX_BYTES) throw new Error('เนื้อหารวมหลังแตกไฟล์ต้องไม่เกิน 100MB')
      if (!row.readError) {
        try {
          parts.push(decoder.decode(data, { stream: !final }))
        } catch {
          row.readError = 'อ่านเนื้อหาไม่ได้ กรุณาบันทึก TXT เป็น UTF-8 แล้วนำเข้าใหม่'
        }
      }
      if (final) {
        row.content = row.readError ? '' : parts.join('')
        if (row.content.includes('\u0000')) row.readError = 'เนื้อหามีอักขระที่ไม่รองรับ กรุณาตรวจสอบไฟล์ TXT'
        completed++
      }
    }
    if (entry.compression !== 0 && entry.compression !== 8) {
      row.readError = 'รูปแบบการบีบอัดนี้ไม่รองรับ กรุณาสร้าง ZIP แบบปกติแล้วนำเข้าใหม่'
      completed++
      return
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  // Feed bounded chunks so expanded size is checked during decompression.
  for (let offset = 0; offset < file.size; offset += 16384) {
    const end = Math.min(offset + 16384, file.size)
    unzip.push(new Uint8Array(await file.slice(offset, end).arrayBuffer()), end === file.size)
  }
  if (!rows.length) throw new Error('ไม่พบไฟล์ตอนใน ZIP')
  if (completed !== rows.length) throw new Error('ไฟล์ ZIP ไม่สมบูรณ์ กรุณาตรวจสอบไฟล์แล้วนำเข้าใหม่')
  return rows.sort((a, b) => Number(a.chapter_number || Infinity) - Number(b.chapter_number || Infinity))
}

const MANGA_IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function mangaZipRow(title: string, images: File[]): ImportedChapter {
  const { chapterNumber, title: chapterTitle } = chapterNameParts(title)
  return {
    id: crypto.randomUUID(), filename: title, title: chapterTitle,
    chapter_number: chapterNumber,
    price: '', status: 'published', published_at: '', content: '', images,
  }
}

export async function readMangaChapterZip(file: File): Promise<ImportedChapter[]> {
  if (!/\.zip$/i.test(file.name)) throw new Error('กรุณาเลือกไฟล์ ZIP')
  if (file.size > CHAPTER_IMPORT_MAX_BYTES) throw new Error('ไฟล์ ZIP ต้องมีขนาดไม่เกิน 100MB')

  const chapters = new Map<string, File[]>()
  let total = 0
  let readError = ''
  const unzip = new Unzip((entry) => {
    if (entry.name.endsWith('/') || entry.name.startsWith('__MACOSX/') || entry.name.split('/').pop()?.startsWith('._')) return
    const parts = entry.name.split('/').filter(Boolean)
    const filename = parts.at(-1) ?? entry.name
    const extension = Object.keys(MANGA_IMAGE_TYPES).find((item) => filename.toLowerCase().endsWith(item))
    if (!extension) {
      readError ||= `รองรับเฉพาะรูปภาพ JPG, PNG และ WEBP (${entry.name})`
      entry.ondata = () => undefined
      entry.start()
      return
    }
    if (parts.length > 2) {
      readError ||= `โครงสร้าง ZIP ซ้อนได้ไม่เกิน 1 โฟลเดอร์ (${entry.name})`
      entry.ondata = () => undefined
      entry.start()
      return
    }

    const chapterName = parts.length === 1 ? file.name.replace(/\.zip$/i, '') : parts[0]
    const data: ArrayBuffer[] = []
    entry.ondata = (error, chunk, final) => {
      if (error) {
        readError ||= `ไม่สามารถแตกไฟล์ ${entry.name} ได้`
        return
      }
      total += chunk.length
      if (total > CHAPTER_IMPORT_MAX_BYTES) {
        readError ||= 'ขนาดรูปภาพหลังแตกไฟล์ต้องไม่เกิน 100MB'
        return
      }
      const copiedChunk = new Uint8Array(chunk.byteLength)
      copiedChunk.set(chunk)
      data.push(copiedChunk.buffer)
      if (final) {
        const images = chapters.get(chapterName) ?? []
        images.push(new File([new Blob(data)], filename, { type: MANGA_IMAGE_TYPES[extension] }))
        chapters.set(chapterName, images)
      }
    }
    if (entry.compression !== 0 && entry.compression !== 8) {
      readError ||= 'รูปแบบการบีบอัดนี้ไม่รองรับ กรุณาสร้าง ZIP แบบปกติแล้วนำเข้าใหม่'
      return
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < file.size; offset += 16384) {
    const end = Math.min(offset + 16384, file.size)
    unzip.push(new Uint8Array(await file.slice(offset, end).arrayBuffer()), end === file.size)
  }
  if (readError) throw new Error(readError)
  if (!chapters.size) throw new Error('ไม่พบรูปภาพใน ZIP')

  const rows = [...chapters.entries()].map(([title, images]) => {
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    return mangaZipRow(title, images)
  })
  if (rows.length > 500) throw new Error('นำเข้าได้สูงสุด 500 ตอน')
  if (rows.some((row) => (row.images?.length ?? 0) > 200)) throw new Error('แต่ละตอนมีรูปภาพได้สูงสุด 200 รูป')
  return rows.sort((a, b) => Number(a.chapter_number || Infinity) - Number(b.chapter_number || Infinity))
}

export function chapterImportErrors(rows: ImportedChapter[], isManga = false): Record<string, string[]> {
  const counts = new Map<number, number>()
  for (const row of rows) counts.set(Number(row.chapter_number), (counts.get(Number(row.chapter_number)) ?? 0) + 1)
  return Object.fromEntries(rows.map((row) => {
    const errors: string[] = []
    if (row.readError) errors.push(row.readError)
    if (row.title.length > 255) errors.push('ชื่อตอนต้องไม่เกิน 255 ตัวอักษร')
    if (!/^\d+(\.\d)?$/.test(row.chapter_number) || Number(row.chapter_number) > 99_999_999.9) errors.push('กรุณาระบุเลขตอน 0–99,999,999.9 ทศนิยมไม่เกิน 1 ตำแหน่ง')
    else if ((counts.get(Number(row.chapter_number)) ?? 0) > 1) errors.push('เลขตอนซ้ำกับรายการอื่นที่นำเข้า')
    if (row.price && (!/^\d+(\.\d{1,2})?$/.test(row.price) || Number(row.price) > 9_999_999_999.99)) errors.push('ราคาไม่ถูกต้อง ต้องเป็น 0–9,999,999,999.99')
    if (isManga ? !(row.images?.length) : !row.content.trim()) errors.push(isManga ? 'กรุณาเพิ่มรูปภาพอย่างน้อย 1 รูป' : 'เนื้อหาตอนว่างเปล่า')
    if (row.status === 'scheduled' && (!row.published_at || !Number.isFinite(new Date(row.published_at).getTime()) || new Date(row.published_at) <= new Date())) errors.push('กรุณาระบุเวลาเผยแพร่ในอนาคต')
    return [row.id, errors]
  }))
}
