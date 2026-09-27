import { t } from 'elysia'

export const localAssetQuerySchema = t.Object({ key: t.String({ minLength: 1, maxLength: 300 }) })
export const signedLocalAssetQuerySchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 300 }),
  expires: t.String({ pattern: '^[0-9]{1,12}$' }),
  signature: t.String({ pattern: '^[a-f0-9]{64}$' }),
})
