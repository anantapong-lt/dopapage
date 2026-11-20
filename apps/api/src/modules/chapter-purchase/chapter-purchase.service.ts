import { db } from '../../db'
import { MODERATION_STATUS } from '../../models/story.model'
import { USER_STATUS, WRITER_STATUS } from '../../models/user.model'
import { COIN_LEDGER_TYPE, recordCoinLedger } from '../coin-ledger/coin-ledger.service'
import type {
  ChapterPurchase,
  ExistingChapterPurchase,
  PurchaseAccount,
  PurchasableChapter,
} from '../../models/chapter-purchase.model'

export interface UserChapterPurchase {
  id: string
  story_title: string
  story_slug: string
  cover_url: string | null
  chapter_number: string
  chapter_title: string
  price: string
  purchased_at: Date
}

export interface ChapterPurchaseHistory {
  purchases: UserChapterPurchase[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

type PurchaseErrorStatus = 400 | 402 | 404 | 409

export class ChapterPurchaseError extends Error {
  constructor(
    message: string,
    readonly statusCode: PurchaseErrorStatus,
  ) {
    super(message)
    this.name = 'ChapterPurchaseError'
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === '23505',
  )
}

export async function purchaseChapter(
  buyerUserId: string,
  chapterId: string,
): Promise<ChapterPurchase> {
  const [purchase] = await purchaseChapters(buyerUserId, [chapterId])
  if (!purchase) throw new Error('Unable to create chapter purchase')
  return purchase
}

export async function findUserChapterPurchaseHistory(
  buyerUserId: string,
  page: number,
  limit: number,
): Promise<ChapterPurchaseHistory> {
  const [count] = await db<{ total: string }[]>`
    SELECT COUNT(*)::TEXT AS total
    FROM chapter_purchases
    WHERE buyer_user_id = ${buyerUserId}::UUID
  `
  const total = Number(count?.total ?? 0)
  const totalPages = Math.ceil(total / limit)
  const safePage = Math.min(page, Math.max(totalPages, 1))
  const purchases = await db<UserChapterPurchase[]>`
    SELECT
      chapter_purchases.id,
      stories.title AS story_title,
      stories.slug AS story_slug,
      stories.cover_url,
      chapters.chapter_number::TEXT,
      chapters.title AS chapter_title,
      chapter_purchases.price::TEXT,
      chapter_purchases.purchased_at
    FROM chapter_purchases
    JOIN chapters ON chapters.id = chapter_purchases.chapter_id
    JOIN stories ON stories.id = chapters.story_id
    WHERE chapter_purchases.buyer_user_id = ${buyerUserId}::UUID
    ORDER BY chapter_purchases.purchased_at DESC, chapter_purchases.id DESC
    LIMIT ${limit} OFFSET ${(safePage - 1) * limit}
  `

  return {
    purchases,
    pagination: { page: safePage, limit, total, totalPages },
  }
}

export async function purchaseChapters(
  buyerUserId: string,
  chapterIds: string[],
): Promise<ChapterPurchase[]> {
  try {
    return await db.begin(async (transaction) => {
      const uniqueChapterIds = [...new Set(chapterIds)]
      if (uniqueChapterIds.length === 0 || uniqueChapterIds.length > 25) {
        throw new ChapterPurchaseError('เลือกซื้อตอนได้ครั้งละ 1 ถึง 25 ตอน', 400)
      }

      const chapterIdArray = db.array(uniqueChapterIds, 'UUID')
      const chapters = await transaction<PurchasableChapter[]>`
        SELECT
          chapters.id,
          chapters.is_free,
          chapters.price::TEXT,
          stories.creator_user_id AS writer_user_id
        FROM chapters
        INNER JOIN stories ON stories.id = chapters.story_id
        INNER JOIN users AS writers ON writers.id = stories.creator_user_id
        WHERE chapters.id = ANY(${chapterIdArray})
          AND chapters.status = 'published'
          AND stories.status IN ('ongoing', 'completed')
          AND stories.deleted_at IS NULL
          AND stories.moderation_status = ${MODERATION_STATUS.ACTIVE}
          AND writers.status = ${USER_STATUS.ACTIVE}
          AND writers.writer_status = ${WRITER_STATUS.ACTIVE}
        ORDER BY chapters.id
        FOR UPDATE OF chapters
      `

      if (chapters.length !== uniqueChapterIds.length) {
        throw new ChapterPurchaseError('มีบางตอนที่ไม่พร้อมจำหน่าย', 404)
      }

      if (chapters.some((chapter) => chapter.is_free || Number(chapter.price) <= 0)) {
        throw new ChapterPurchaseError('รายการที่เลือกมีตอนฟรีหรือตอนที่ยังไม่ได้กำหนดราคา', 400)
      }

      const writerUserIds = [...new Set(chapters.map((chapter) => chapter.writer_user_id))]
      const accountIds = [...new Set([buyerUserId, ...writerUserIds])]
      const accountIdArray = db.array(accountIds, 'UUID')
      const accounts = await transaction<PurchaseAccount[]>`
        SELECT id, balance::TEXT, status, deleted_at
        FROM users
        WHERE id = ANY(${accountIdArray})
        ORDER BY id
        FOR UPDATE
      `

      const buyer = accounts.find((account) => account.id === buyerUserId)

      if (!buyer || buyer.status !== 'active' || buyer.deleted_at) {
        throw new ChapterPurchaseError('ไม่พบบัญชีผู้ซื้อที่พร้อมใช้งาน', 404)
      }

      const existingPurchases = await transaction<ExistingChapterPurchase[]>`
        SELECT id
        FROM chapter_purchases
        WHERE buyer_user_id = ${buyerUserId}
          AND chapter_id = ANY(${chapterIdArray})
      `

      if (existingPurchases.length > 0) {
        throw new ChapterPurchaseError('มีบางตอนในรายการที่ซื้อแล้ว', 409)
      }

      const totalPrice = chapters.reduce(
        (total, chapter) => total + Math.round(Number(chapter.price) * 100),
        0,
      ) / 100
      if (Number(buyer.balance) < totalPrice) {
        throw new ChapterPurchaseError('ยอดเงินคงเหลือไม่เพียงพอ', 402)
      }

      const purchases: ChapterPurchase[] = []
      const writerCredits = new Map<string, number>()

      for (const chapter of chapters) {
        const [purchase] = await transaction<ChapterPurchase[]>`
          INSERT INTO chapter_purchases (
            buyer_user_id,
            writer_user_id,
            chapter_id,
            price
          ) VALUES (
            ${buyerUserId},
            ${chapter.writer_user_id},
            ${chapter.id},
            ${chapter.price}::NUMERIC
          )
          RETURNING
            id,
            chapter_id,
            price::TEXT,
            purchased_at
        `
        if (!purchase) throw new Error('Unable to create chapter purchase')

        purchases.push(purchase)
        const currentCredit = writerCredits.get(chapter.writer_user_id) ?? 0
        writerCredits.set(
          chapter.writer_user_id,
          Math.round((currentCredit + Number(chapter.price)) * 100) / 100,
        )
      }

      const [updatedBuyer] = await transaction<{ balance: string }[]>`
        UPDATE users
        SET balance = balance - ${totalPrice}::NUMERIC, updated_at = NOW()
        WHERE id = ${buyerUserId}
        RETURNING balance::TEXT AS balance
      `
      if (updatedBuyer) {
        await recordCoinLedger(transaction, {
          userId: buyerUserId,
          entryType: COIN_LEDGER_TYPE.PURCHASE,
          amount: -totalPrice,
          balanceAfter: updatedBuyer.balance,
          referenceType: 'chapter_purchase',
          referenceId: purchases.length === 1 ? purchases[0]?.id ?? null : null,
          note: `ซื้อ ${purchases.length} ตอน`,
        })
      }

      for (const [writerUserId, credit] of writerCredits) {
        if (credit <= 0) continue
        const [updatedWriter] = await transaction<{ balance: string }[]>`
          UPDATE users
          SET balance = balance + ${credit}::NUMERIC, updated_at = NOW()
          WHERE id = ${writerUserId}
          RETURNING balance::TEXT AS balance
        `
        if (updatedWriter) {
          await recordCoinLedger(transaction, {
            userId: writerUserId,
            entryType: COIN_LEDGER_TYPE.SALE,
            amount: credit,
            balanceAfter: updatedWriter.balance,
            referenceType: 'chapter_purchase',
            referenceId: purchases.length === 1 ? purchases[0]?.id ?? null : null,
          })
        }
      }

      return purchases
    })
  } catch (error) {
    if (error instanceof ChapterPurchaseError) throw error
    if (isUniqueViolation(error)) {
      throw new ChapterPurchaseError('คุณซื้อตอนนี้แล้ว', 409)
    }
    throw error
  }
}
