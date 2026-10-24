import { db } from '../../db'

export interface WriterStats {
  story_count: string
  chapter_count: string
  total_views: string
  favorite_count: string
  free_chapter_count: string
}

export type WriterDashboardPeriod = 'today' | 'this-week' | 'this-month'

export interface WriterDashboardActivity {
  bucket: string
  gross_sales: string
  view_count: string
}

export interface WriterDashboardTopStory {
  id: string
  title: string
  value: string
}

export async function getWriterStats(userId: string): Promise<WriterStats> {
  const [stats] = await db<WriterStats[]>`
    SELECT
      (
        SELECT COUNT(*)
        FROM stories
        WHERE creator_user_id = ${userId}
          AND deleted_at IS NULL
      )::TEXT AS story_count,
      (
        SELECT COUNT(*)
        FROM chapters
        INNER JOIN stories ON stories.id = chapters.story_id
        WHERE stories.creator_user_id = ${userId}
          AND stories.deleted_at IS NULL
      )::TEXT AS chapter_count,
      (
        SELECT COALESCE(SUM(total_views), 0)
        FROM stories
        WHERE creator_user_id = ${userId}
          AND deleted_at IS NULL
      )::TEXT AS total_views,
      (
        SELECT COUNT(*)
        FROM story_favorites
        INNER JOIN stories ON stories.id = story_favorites.story_id
        WHERE stories.creator_user_id = ${userId}
          AND stories.deleted_at IS NULL
      )::TEXT AS favorite_count,
      (
        SELECT COUNT(*)
        FROM chapters
        INNER JOIN stories ON stories.id = chapters.story_id
        WHERE stories.creator_user_id = ${userId}
          AND stories.deleted_at IS NULL
          AND chapters.is_free = TRUE
      )::TEXT AS free_chapter_count
  `

  return stats
}

export async function getWriterDashboardActivity(
  userId: string,
  period: WriterDashboardPeriod,
): Promise<WriterDashboardActivity[]> {
  const startUnit = period === 'today' ? 'day' : period === 'this-week' ? 'week' : 'month'
  const unit = period === 'today' ? 'hour' : 'day'
  const interval = period === 'today' ? '1 hour' : '1 day'

  return db<WriterDashboardActivity[]>`
    WITH bounds AS (
      SELECT date_trunc(${startUnit}, NOW() AT TIME ZONE 'Asia/Bangkok') AS starts_at,
        NOW() AT TIME ZONE 'Asia/Bangkok' AS ends_at
    ), buckets AS (
      SELECT generate_series(
        date_trunc(${unit}, starts_at),
        date_trunc(${unit}, ends_at),
        ${interval}::INTERVAL
      ) AS bucket
      FROM bounds
    ), sales AS (
      SELECT date_trunc(${unit}, cp.purchased_at AT TIME ZONE 'Asia/Bangkok') AS bucket,
        SUM(cp.price) AS gross_sales
      FROM chapter_purchases cp
      JOIN chapters ON chapters.id = cp.chapter_id
      JOIN stories ON stories.id = chapters.story_id
      CROSS JOIN bounds
      WHERE stories.creator_user_id = ${userId}
        AND stories.deleted_at IS NULL
        AND cp.purchased_at >= (bounds.starts_at AT TIME ZONE 'Asia/Bangkok')
        AND cp.purchased_at <= (bounds.ends_at AT TIME ZONE 'Asia/Bangkok')
      GROUP BY 1
    )
    SELECT to_char(buckets.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00' AS bucket,
      ROUND(COALESCE(sales.gross_sales, 0), 2)::TEXT AS gross_sales,
      '0'::TEXT AS view_count
    FROM buckets
    LEFT JOIN sales ON sales.bucket = buckets.bucket
    ORDER BY buckets.bucket
  `
}

export async function getWriterDashboardTopStories(
  userId: string,
  period: WriterDashboardPeriod,
): Promise<{ sales: WriterDashboardTopStory[]; views: WriterDashboardTopStory[] }> {
  const startUnit = period === 'today' ? 'day' : period === 'this-week' ? 'week' : 'month'
  const [sales, views] = await Promise.all([
    db<WriterDashboardTopStory[]>`
      WITH bounds AS (
        SELECT date_trunc(${startUnit}, NOW() AT TIME ZONE 'Asia/Bangkok') AS starts_at,
          NOW() AT TIME ZONE 'Asia/Bangkok' AS ends_at
      )
      SELECT stories.id, stories.title, ROUND(COALESCE(SUM(cp.price), 0), 2)::TEXT AS value
      FROM chapter_purchases cp
      JOIN chapters ON chapters.id = cp.chapter_id
      JOIN stories ON stories.id = chapters.story_id
      CROSS JOIN bounds
      WHERE stories.creator_user_id = ${userId}
        AND stories.deleted_at IS NULL
        AND cp.purchased_at >= (bounds.starts_at AT TIME ZONE 'Asia/Bangkok')
        AND cp.purchased_at <= (bounds.ends_at AT TIME ZONE 'Asia/Bangkok')
      GROUP BY stories.id
      ORDER BY SUM(cp.price) DESC, stories.title ASC
      LIMIT 5
    `,
    db<WriterDashboardTopStory[]>`
      WITH bounds AS (
        SELECT date_trunc(${startUnit}, NOW() AT TIME ZONE 'Asia/Bangkok') AS starts_at,
          NOW() AT TIME ZONE 'Asia/Bangkok' AS ends_at
      )
      SELECT stories.id, stories.title, COALESCE(SUM(sdv.view_count), 0)::TEXT AS value
      FROM story_daily_views sdv
      JOIN stories ON stories.id = sdv.story_id
      CROSS JOIN bounds
      WHERE stories.creator_user_id = ${userId}
        AND stories.deleted_at IS NULL
        AND sdv.view_date BETWEEN bounds.starts_at::DATE AND bounds.ends_at::DATE
      GROUP BY stories.id
      ORDER BY SUM(sdv.view_count) DESC, stories.title ASC
      LIMIT 5
    `,
  ])

  return { sales, views }
}
