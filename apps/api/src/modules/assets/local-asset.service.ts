import { createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { S3Client } from 'bun'
import { env } from '../../config/env'

const LOCAL_KEY_PREFIX = 'local/'
const ASSETS_DIRECTORY = resolve(import.meta.dir, '../../../assets')
const LOCAL_KEY_PATTERN = /^local\/(?:stories\/(?:covers\/[a-f0-9-]+\.webp|chapters\/[a-zA-Z0-9-]+\/\d+(?:\.\d+)?\/[a-f0-9-]+(?:-\d+)?\.(?:webp|mp3))|profiles\/(?:covers|avatars)\/[a-f0-9-]+\.webp|withdrawal-proofs\/[a-f0-9-]+\/[a-f0-9-]+\.(?:pdf|png|jpg)|site\/logos\/[a-f0-9-]+\.webp|site\/favicons\/[a-f0-9-]+\.png)$/
const PUBLIC_LOCAL_KEY_PATTERN = /^local\/(?:stories\/(?:covers\/[a-f0-9-]+\.webp|chapters\/[a-zA-Z0-9-]+\/\d+(?:\.\d+)?\/[a-f0-9-]+-\d+\.mp3)|profiles\/(?:covers|avatars)\/[a-f0-9-]+\.webp|site\/logos\/[a-f0-9-]+\.webp|site\/favicons\/[a-f0-9-]+\.png)$/

export type StorageBucket = 'public' | 'manga' | 'transfer-proof'

function r2Bucket(bucket: StorageBucket): string {
  const value = bucket === 'public'
    ? env.R2_BUCKET_NAME
    : bucket === 'manga' ? env.R2_MANGA_BUCKET_NAME : env.R2_TRANSFER_PROOF_BUCKET_NAME
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !value)
    throw new Error(`R2 ${bucket} storage configuration is incomplete`)
  return value
}

function r2(bucket: StorageBucket): S3Client {
  return new S3Client({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: r2Bucket(bucket),
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  })
}

function localAssetPath(key: string): string {
  if (!LOCAL_KEY_PATTERN.test(key)) throw new Error('Invalid local asset key')
  return resolve(ASSETS_DIRECTORY, key.slice(LOCAL_KEY_PREFIX.length))
}

function signature(scope: string, key: string, expires: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`${scope}\n${key}\n${expires}`)
    .digest('hex')
}

function hasValidSignature(scope: string, key: string, expires: string, value: string): boolean {
  return LOCAL_KEY_PATTERN.test(key)
    && /^\d+$/.test(expires)
    && Number(expires) > Math.floor(Date.now() / 1000)
    && /^[a-f0-9]{64}$/.test(value)
    && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(signature(scope, key, expires), 'hex'))
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.mp3')) return 'audio/mpeg'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.pdf')) return 'application/pdf'
  return 'image/jpeg'
}

export function localAssetKey(key: string): string {
  return `${LOCAL_KEY_PREFIX}${key}`
}

export function isLocalAssetKey(key: string): boolean {
  return key.startsWith(LOCAL_KEY_PREFIX)
}

export async function writeLocalAsset(key: string, data: Blob | Buffer): Promise<void> {
  const path = localAssetPath(key)
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, data)
}

export async function deleteLocalAsset(key: string): Promise<void> {
  await rm(localAssetPath(key), { force: true })
}

export async function uploadAsset(storageKey: string, data: Blob | Buffer, options: { bucket: StorageBucket; contentType: string }): Promise<string> {
  if (env.LOCAL_UPLOAD) {
    const key = localAssetKey(storageKey)
    await writeLocalAsset(key, data)
    return key
  }
  await r2(options.bucket).write(storageKey, data, { type: options.contentType })
  return storageKey
}

export async function deleteAsset(key: string, bucket: StorageBucket): Promise<void> {
  if (isLocalAssetKey(key)) return deleteLocalAsset(key)
  await r2(bucket).delete(key)
}

export function createAssetUploadUrl(storageKey: string, bucket: StorageBucket): { key: string; uploadUrl: string } {
  if (env.LOCAL_UPLOAD) {
    const key = localAssetKey(storageKey)
    return { key, uploadUrl: createSignedLocalAssetUrl(key, 'tts-upload') }
  }
  return { key: storageKey, uploadUrl: r2(bucket).presign(storageKey, { expiresIn: 15 * 60, method: 'PUT' }) }
}

export function createPublicLocalAssetUrl(key: string): string {
  if (!PUBLIC_LOCAL_KEY_PATTERN.test(key)) throw new Error('Invalid public local asset key')
  const url = new URL(`${env.API_ORIGIN.replace(/\/$/, '')}/assets/local`)
  url.searchParams.set('key', key)
  return url.toString()
}

export function createPublicAssetUrl(key: string): string {
  if (isLocalAssetKey(key)) return createPublicLocalAssetUrl(key)
  if (!env.R2_PUBLIC_URL) throw new Error('R2 public storage configuration is incomplete')
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
}

export function createPrivateAssetUrl(key: string, bucket: StorageBucket): string {
  return isLocalAssetKey(key)
    ? createSignedLocalAssetUrl(key, 'proof')
    : r2(bucket).presign(key, { expiresIn: 5 * 60, method: 'GET' })
}

export function createSignedLocalAssetUrl(key: string, scope: 'proof' | 'tts-upload'): string {
  localAssetPath(key)
  const expires = String(Math.floor(Date.now() / 1000) + (scope === 'tts-upload' ? 15 * 60 : 5 * 60))
  const path = scope === 'tts-upload' ? '/assets/tts-upload' : '/assets/private'
  const url = new URL(`${env.API_ORIGIN.replace(/\/$/, '')}${path}`)
  url.search = new URLSearchParams({ key, expires, signature: signature(scope, key, expires) }).toString()
  return url.toString()
}

export async function findPublicLocalAsset(key: string): Promise<ReturnType<typeof Bun.file> | null> {
  if (!PUBLIC_LOCAL_KEY_PATTERN.test(key)) return null
  const file = Bun.file(localAssetPath(key), { type: contentTypeFor(key) })
  return await file.exists() ? file : null
}

export async function findSignedLocalAsset(key: string, expires: string, value: string, scope: 'proof'): Promise<ReturnType<typeof Bun.file> | null> {
  if (!hasValidSignature(scope, key, expires, value)) return null
  const file = Bun.file(localAssetPath(key), { type: contentTypeFor(key) })
  return await file.exists() ? file : null
}

export async function writeSignedTtsAsset(key: string, expires: string, value: string, data: ArrayBuffer): Promise<boolean> {
  if (!hasValidSignature('tts-upload', key, expires, value) || !key.endsWith('.mp3')) return false
  await writeLocalAsset(key, Buffer.from(data))
  return true
}
