import { t } from 'elysia'
import { ADMIN_WRITER_STATUSES, WRITER_STATUSES } from '../../models/user.model'

export const adminWritersQuerySchema = t.Object({
  search: t.Optional(t.String({ maxLength: 255 })),
  // An omitted filter means all statuses; UnionEnum defaults to the first value.
  status: t.Optional(t.Union(WRITER_STATUSES.map((value) => t.Literal(value)))),
  page: t.Optional(t.Numeric({ minimum: 1, maximum: 2_147_483_647, multipleOf: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
})

export const adminWriterStatusBodySchema = t.Object({
  status: t.UnionEnum(ADMIN_WRITER_STATUSES),
  reason: t.Optional(t.String({ minLength: 1, maxLength: 1_000 })),
}, { additionalProperties: false })

export const adminWriterParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }),
})
