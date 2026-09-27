import { status } from 'elysia'
import { findPublicLocalAsset, findSignedLocalAsset, writeSignedTtsAsset } from './local-asset.service'

export async function publicLocalAssetResponse(key: string) {
  return (await findPublicLocalAsset(key)) ?? status(404, { message: 'Asset not found' })
}

export async function privateLocalAssetResponse(key: string, expires: string, signature: string) {
  return (await findSignedLocalAsset(key, expires, signature, 'proof')) ?? status(404, { message: 'Asset not found' })
}

export async function uploadLocalTtsAssetResponse(key: string, expires: string, signature: string, request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'audio/mpeg') return status(415, { message: 'Expected audio/mpeg' })
  const stored = await writeSignedTtsAsset(key, expires, signature, await request.arrayBuffer())
  return stored ? new Response(null, { status: 204 }) : status(404, { message: 'Upload URL is invalid or expired' })
}
