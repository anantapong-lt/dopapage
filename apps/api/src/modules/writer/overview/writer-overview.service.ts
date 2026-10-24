import { db } from '../../../db'

export type OverviewPeriod = 'today' | 'this-week' | 'this-month'

interface OverviewSummary {
  title: string
  total_views: string
  chapter_count: string
}

interface PurchasePoint {
  bucket: string
  purchase_count: string
  gross_sales: string
}

export async function findOverviewSummary(userId: string, contentId: string) {
  const [summary] = await db<OverviewSummary[]>`
    SELECT stories.title, stories.total_views::TEXT,
      COUNT(chapters.id)::TEXT AS chapter_count
    FROM stories
    LEFT JOIN chapters ON chapters.story_id = stories.id
    WHERE stories.id = ${contentId} AND stories.creator_user_id = ${userId}
      AND stories.deleted_at IS NULL
    GROUP BY stories.id
  `
  return summary
}

export async function findOverviewPurchases(
  userId: string,
  contentId: string,
  period: OverviewPeriod,
) {
  const unit = period === 'today' ? 'hour' : 'day'
  const startUnit = period === 'today' ? 'day' : period === 'this-week' ? 'week' : 'month'
  const interval = period === 'today' ? '1 hour' : '1 day'
  return db<PurchasePoint[]>`
    WITH bounds AS (
      SELECT date_trunc(${startUnit}, NOW() AT TIME ZONE 'Asia/Bangkok') AS starts_at,
        NOW() AT TIME ZONE 'Asia/Bangkok' AS ends_at
    ), buckets AS (
      SELECT generate_series(starts_at, date_trunc(${unit}, ends_at), ${interval}::INTERVAL) AS bucket
      FROM bounds
    ), purchases AS (
      SELECT date_trunc(${unit}, cp.purchased_at AT TIME ZONE 'Asia/Bangkok') AS bucket,
        COUNT(*) AS purchase_count, SUM(cp.price) AS gross_sales
      FROM chapter_purchases cp
      JOIN chapters ON chapters.id = cp.chapter_id
      JOIN stories ON stories.id = chapters.story_id
      CROSS JOIN bounds
      WHERE stories.id = ${contentId} AND stories.creator_user_id = ${userId}
        AND stories.deleted_at IS NULL
        AND cp.purchased_at >= (bounds.starts_at AT TIME ZONE 'Asia/Bangkok')
        AND cp.purchased_at <= (bounds.ends_at AT TIME ZONE 'Asia/Bangkok')
      GROUP BY 1
    )
    SELECT to_char(buckets.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00' AS bucket,
      COALESCE(purchases.purchase_count, 0)::TEXT AS purchase_count,
      ROUND(COALESCE(purchases.gross_sales, 0), 2)::TEXT AS gross_sales
    FROM buckets LEFT JOIN purchases ON purchases.bucket = buckets.bucket
    ORDER BY buckets.bucket
  `
}
