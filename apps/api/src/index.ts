import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { env } from './config/env'
import { adminAccountsRoutes } from './modules/admin-accounts/admin-accounts.routes'
import { adminUsersRoutes } from './modules/admin-users/admin-users.routes'
import { adminWriterApplicationRoutes } from './modules/admin-writer-applications/admin-writer-applications.routes'
import { adminWritersRoutes } from './modules/admin-writers/admin-writers.routes'
import { adminPurchasesRoutes } from './modules/admin-purchases/admin-purchases.routes'
import { adminTopupsRoutes } from './modules/admin-topups/admin-topups.routes'
import { adminContentsRoutes } from './modules/admin-contents/admin-contents.routes'
import { adminDashboardRoutes } from './modules/admin-dashboard/admin-dashboard.routes'
import { adminSiteRoutes } from './modules/admin-site/admin-site.routes'
import { adminSystemRoutes } from './modules/admin-system/admin-system.routes'
import { writeSystemLog } from './modules/admin-system/admin-system-log.service'
import { adminWithdrawalRoutes } from './modules/admin-withdrawals/admin-withdrawals.routes'
import { agreementsRoutes } from './modules/agreements/agreements.routes'
import { authRoutes } from './modules/auth/auth.routes'
import { chapterPurchaseRoutes } from './modules/chapter-purchase/chapter-purchase.routes'
import { contentRoutes } from './modules/content/content.routes'
import { genreOptionsRoutes } from './modules/genre-options/genre-options.routes'
import { landingRoutes } from './modules/landing/landing.routes'
import { notificationRoutes } from './modules/notifications/notifications.routes'
import { profilesRoutes } from './modules/profiles/profiles.routes'
import { siteConfigRoutes } from './modules/site-config/site-config.routes'
import { topupRoutes } from './modules/topup/topup.routes'
import { publishScheduledChapters } from './modules/writer/chapter/writer-chapter.service'
import { writerRoutes } from './modules/writer/writer.routes'
import { writerChapterPageRoutes } from './modules/writer/chapter/writer-chapter-page.routes'
import { writerBankAccountRoutes } from './modules/writer-bank-account/writer-bank-account.routes'
import { writerWithdrawalRoutes } from './modules/writer-withdrawals/writer-withdrawals.routes'
import { ttsAgentRoutes } from './modules/tts-agent/tts-agent.routes'
import { localAssetRoutes } from './modules/assets/local-asset.routes'

const CHAPTER_PUBLISH_INTERVAL_MS = 60_000
const requestStartedAt = new WeakMap<Request, number>()

function formatRequestLog(statusCode: number, message: string) {
  const color = statusCode >= 400 ? '\x1b[31m' : '\x1b[32m'
  return `${color}${message}\x1b[0m`
}

async function runChapterPublisher() {
  try {
    const publishedCount = await publishScheduledChapters()
    if (publishedCount > 0) console.log(`Published ${publishedCount} scheduled chapter(s)`)
  } catch (error) {
    console.error('Unable to publish scheduled chapters', error)
  }
}
//asd
const app = new Elysia()
  .onRequest(({ request }) => {
    requestStartedAt.set(request, Date.now())
  })
  .onAfterResponse(({ request, set }) => {
    const url = new URL(request.url)
    const duration = Date.now() - (requestStartedAt.get(request) ?? Date.now())
    const status = typeof set.status === 'number' ? set.status : 200
    const message = `[request] ${request.method} ${url.pathname} ${status} ${duration}ms`
    writeSystemLog(status >= 400 ? 'error' : 'info', message)
    console.log(formatRequestLog(status, message))
  })
  .use(
    cors({
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
      credentials: true,
    }),
  )
  .use(adminAccountsRoutes)
  .use(adminUsersRoutes)
  .use(adminWriterApplicationRoutes)
  .use(adminWritersRoutes)
  .use(adminPurchasesRoutes)
  .use(adminTopupsRoutes)
  .use(adminContentsRoutes)
  .use(adminDashboardRoutes)
  .use(adminSiteRoutes)
  .use(adminSystemRoutes)
  .use(adminWithdrawalRoutes)
  .use(agreementsRoutes)
  .use(authRoutes)
  .use(chapterPurchaseRoutes)
  .use(contentRoutes)
  .use(genreOptionsRoutes)
  .use(landingRoutes)
  .use(notificationRoutes)
  .use(profilesRoutes)
  .use(siteConfigRoutes)
  .use(topupRoutes)
  .use(writerBankAccountRoutes)
  .use(writerWithdrawalRoutes)
  .use(ttsAgentRoutes)
  .use(localAssetRoutes)
  .use(writerRoutes)
  .use(writerChapterPageRoutes)

app.listen({ port: env.PORT, maxRequestBodySize: 650 * 1024 * 1024 })

void runChapterPublisher()
setInterval(() => void runChapterPublisher(), CHAPTER_PUBLISH_INTERVAL_MS)

console.log(`API server is running on http://localhost:${env.PORT}`)
