import { S3Client } from 'bun'
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { env } from '../../../config/env'
import { deleteAsset, uploadAsset } from '../../assets/local-asset.service'

const PAGE_WIDTH = 2400
const PAGE_QUALITY = 85
const PAGE_COMPRESSION_THRESHOLD_BYTES = 700 * 1024
const LOCAL_KEY_PREFIX = 'local/'
const LOCAL_KEY_PATTERN = /^local\/stories\/chapters\/[a-zA-Z0-9-]+\/\d+(?:\.\d+)?\/[a-f0-9-]+\.webp$/
const ASSETS_DIRECTORY = resolve(import.meta.dir, '../../../../assets')

function localPagePath(key: string): string {
  if (!LOCAL_KEY_PATTERN.test(key)) throw new Error('Invalid local chapter page key')
  return resolve(ASSETS_DIRECTORY, key.slice(LOCAL_KEY_PREFIX.length))
}

function localPageSignature(key: string, expires: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`manga-page\n${key}\n${expires}`)
    .digest('hex')
}

export interface UploadedChapterPage {
  key: string
  width: number
  height: number
}

function createR2Client() {
  if (
    !env.R2_ACCOUNT_ID
    || !env.R2_ACCESS_KEY_ID
    || !env.R2_SECRET_ACCESS_KEY
    || !env.R2_MANGA_BUCKET_NAME
  ) {
    throw new Error('R2 configuration is incomplete')
  }

  return new S3Client({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_MANGA_BUCKET_NAME,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  })
}

export async function uploadWriterChapterPage(
  file: File,
  storyId: string,
  chapterNumber: number,
): Promise<UploadedChapterPage> {
  const input = Buffer.from(await file.arrayBuffer())
  const image = sharp(input).rotate()
  if (file.size > PAGE_COMPRESSION_THRESHOLD_BYTES) {
    image.resize({ width: PAGE_WIDTH, fit: 'inside', withoutEnlargement: true })
  }
  const { data, info } = await image
    .webp({ quality: PAGE_QUALITY })
    .toBuffer({ resolveWithObject: true })
  const storageKey = `stories/chapters/${storyId}/${chapterNumber}/${crypto.randomUUID()}.webp`
  const key = await uploadAsset(storageKey, data, { bucket: 'manga', contentType: 'image/webp' })

  return {
    key,
    width: info.width,
    height: info.height,
  }
}

export function createWriterChapterPageSignedUrl(key: string): string {
  if (key.startsWith(LOCAL_KEY_PREFIX)) {
    localPagePath(key)
    const expires = String(Math.floor(Date.now() / 1000) + 5 * 60)
    const url = new URL(`${env.API_ORIGIN.replace(/\/$/, '')}/assets/manga`)
    url.search = new URLSearchParams({ key, expires, signature: localPageSignature(key, expires) }).toString()
    return url.toString()
  }

  return createR2Client().presign(key, {
    expiresIn: 5 * 60,
    method: 'GET',
  })
}

export async function deleteWriterChapterPage(key: string): Promise<void> {
  await deleteAsset(key, 'manga')
}

export async function findLocalWriterChapterPage(key: string, expires: string, signature: string) {
  if (
    !LOCAL_KEY_PATTERN.test(key)
    || !/^\d+$/.test(expires)
    || Number(expires) <= Math.floor(Date.now() / 1000)
    || !/^[a-f0-9]{64}$/.test(signature)
    || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(localPageSignature(key, expires), 'hex'))
  ) return null

  const file = Bun.file(localPagePath(key), { type: 'image/webp' })
  return await file.exists() ? file : null
}
