import { t } from 'elysia'

export const adminSystemLogsQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 50 })),
  status: t.Optional(t.Union([
    t.Literal('all'), t.Literal('2xx'), t.Literal('3xx'), t.Literal('4xx'), t.Literal('5xx'),
  ], { default: 'all' })),
  search: t.Optional(t.String({ maxLength: 120 })),
  date: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
})
