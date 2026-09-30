FROM oven/bun:1-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/shared/package.json ./apps/shared/package.json
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/shared/package.json ./apps/shared/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY apps/admin ./apps/admin
COPY apps/web ./apps/web
COPY apps/shared ./apps/shared
RUN ln -s ../admin/node_modules /app/apps/web/node_modules
RUN ln -s ../admin/node_modules /app/apps/shared/node_modules
WORKDIR /app/apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs

EXPOSE 3002

ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "./apps/admin/server.js"]
