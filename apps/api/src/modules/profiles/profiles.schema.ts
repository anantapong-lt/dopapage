import { t } from 'elysia'

export const profileUsernameParamsSchema = t.Object({
  username: t.String({ minLength: 3, maxLength: 50 }),
})

export const profileStoriesQuerySchema = t.Object({
  type: t.Optional(t.Union([t.Literal('novel'), t.Literal('manga')])),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 24, multipleOf: 1 })),
})

export const favoriteStoriesQuerySchema = t.Object({
  type: t.Union([t.Literal('novel'), t.Literal('manga')]),
  page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 24, multipleOf: 1 })),
})

export const randomProfilesQuerySchema = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 12, multipleOf: 1 })),
})

export const profileSocialLinksSchema = t.Object({
  facebook: t.Optional(t.String({ maxLength: 2048, pattern: '^https?://' })),
  instagram: t.Optional(t.String({ maxLength: 2048, pattern: '^https?://' })),
  x: t.Optional(t.String({ maxLength: 2048, pattern: '^https?://' })),
  tiktok: t.Optional(t.String({ maxLength: 2048, pattern: '^https?://' })),
  youtube: t.Optional(t.String({ maxLength: 2048, pattern: '^https?://' })),
  website: t.Optional(t.String({ maxLength: 2048, pattern: '^https?://' })),
})

export const updateMyProfileBodySchema = t.Object({
  bio: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  social_links: t.Optional(profileSocialLinksSchema),
})

const contentDisplayModeSchema = t.Union([
  t.Literal('hide'),
  t.Literal('both'),
  t.Literal('only'),
])

export const readingSettingsSchema = t.Object({
  fontSize: t.Numeric({ minimum: 16, maximum: 32, multipleOf: 1 }),
  fontFamily: t.Union([
    t.Literal('sans'),
    t.Literal('serif'),
    t.Literal('arial'),
    t.Literal('cordia-new'),
    t.Literal('tf-nopscript'),
    t.Literal('sarabun'),
    t.Literal('noto-serif-thai'),
    t.Literal('prompt'),
    t.Literal('layiji-mahaniyom'),
  ]),
  theme: t.Union([
    t.Literal('light'),
    t.Literal('sepia'),
    t.Literal('gray'),
    t.Literal('sage'),
    t.Literal('dark'),
  ]),
  autoNext: t.Boolean(),
  autoPurchase: t.Boolean(),
  preferredTtsVoice: t.Union([
    t.Literal('female'),
    t.Literal('young_male'),
    t.Literal('old_male'),
  ]),
  contentFilters: t.Object({
    age18: contentDisplayModeSchema,
    bl: contentDisplayModeSchema,
    gl: contentDisplayModeSchema,
  }),
})

export const updateMyProfileCoverBodySchema = t.Object({
  cover: t.File({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: '5m',
  }),
})

export const updateMyProfileAvatarBodySchema = t.Object({
  avatar: t.File({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: '5m',
  }),
})
