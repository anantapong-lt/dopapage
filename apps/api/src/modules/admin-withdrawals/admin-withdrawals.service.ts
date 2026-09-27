import { db } from '../../db'
import { createPrivateAssetUrl, uploadAsset } from '../assets/local-asset.service'
import { NOTIFICATION_TYPE } from '../../models/notification.model'
import { WITHDRAWAL_STATUS, type WithdrawalStatus } from '../../models/withdrawal.model'

interface WithdrawalRow {
  id: string
  writer_user_id: string
  display_name: string
  username: string
  requested_amount: string
  commission_amount: string
  net_amount: string
  bank_code: string
  account_number: string
  requested_at: Date
  status: WithdrawalStatus
  approval_note: string | null
  rejection_reason: string | null
  transfer_proof_key: string | null
  reviewed_by: string | null
}

function map(row: WithdrawalRow) {
  return {
    id: row.id,
    user: { id: row.writer_user_id, display_name: row.display_name, username: row.username },
    requested_amount: row.requested_amount,
    commission_amount: row.commission_amount,
    net_amount: row.net_amount,
    bank_code: row.bank_code,
    account_number: row.account_number,
    requested_at: row.requested_at,
    status: row.status,
  note: row.status === WITHDRAWAL_STATUS.REJECTED ? row.rejection_reason : row.approval_note,
    processed_by: row.reviewed_by,
    has_proof: Boolean(row.transfer_proof_key),
  }
}
const select = `wr.id, wr.writer_user_id, u.display_name, u.username, wr.requested_amount::TEXT, wr.commission_amount::TEXT, wr.net_amount::TEXT, wr.bank_code, wr.account_number, wr.requested_at, wr.status, wr.approval_note, wr.rejection_reason, wr.transfer_proof_key, reviewer.email AS reviewed_by`

export async function findAdminWithdrawals(selectedStatus: WithdrawalStatus | null, search: string) {
  const rows = await db<WithdrawalRow[]>`
    SELECT ${db.unsafe(select)} FROM withdrawal_requests wr JOIN users u ON u.id = wr.writer_user_id LEFT JOIN users reviewer ON reviewer.id = wr.reviewed_by_user_id
    WHERE (${selectedStatus}::withdrawal_request_status IS NULL OR wr.status = ${selectedStatus})
      AND (${search} = '' OR STRPOS(LOWER(u.display_name), LOWER(${search})) > 0 OR STRPOS(LOWER(u.username), LOWER(${search})) > 0 OR STRPOS(LOWER(wr.id::TEXT), LOWER(${search})) > 0)
    ORDER BY wr.requested_at DESC, wr.id DESC
  `
  return rows.map(map)
}

async function uploadProof(file: File, requestId: string) {
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  return uploadAsset(`withdrawal-proofs/${requestId}/${crypto.randomUUID()}.${extension}`, new Blob([await file.arrayBuffer()], { type: file.type }), {
    bucket: 'transfer-proof', contentType: file.type,
  })
}

export async function processAdminWithdrawal(
  id: string,
  adminId: string,
  action: 'approve' | 'reject' | 'pay',
  note: string,
  proof?: File,
) {
  if (action === 'approve' && !proof) throw new Error('กรุณาแนบหลักฐานการโอน')
  if (action === 'reject' && !note) throw new Error('กรุณาระบุเหตุผลที่ปฏิเสธ')
  const nextStatus: WithdrawalStatus = action === 'approve' ? WITHDRAWAL_STATUS.APPROVED : action === 'reject' ? WITHDRAWAL_STATUS.REJECTED : WITHDRAWAL_STATUS.PAID
  const proofKey = proof ? await uploadProof(proof, id) : null
  const rows = await db.begin(async (tx) => {
    const [current] = await tx<
      WithdrawalRow[]
    >`SELECT ${tx.unsafe(select)} FROM withdrawal_requests wr JOIN users u ON u.id = wr.writer_user_id LEFT JOIN users reviewer ON reviewer.id = wr.reviewed_by_user_id WHERE wr.id = ${id} FOR UPDATE OF wr`
    if (!current) throw new Error('ไม่พบคำขอถอนเงิน')
    if (
      (action === 'approve' && current.status !== WITHDRAWAL_STATUS.PENDING) ||
      (action === 'reject' && current.status !== WITHDRAWAL_STATUS.PENDING) ||
      (action === 'pay' && current.status !== WITHDRAWAL_STATUS.APPROVED)
    )
      throw new Error('สถานะคำขอไม่สามารถเปลี่ยนได้')
    await tx`
      UPDATE withdrawal_requests SET status = ${nextStatus}, reviewed_by_user_id = ${adminId}, approval_note = ${action === 'approve' ? note || null : current.approval_note}, rejection_reason = ${action === 'reject' ? note : current.rejection_reason}, transfer_proof_key = COALESCE(${proofKey}, transfer_proof_key), approved_at = CASE WHEN ${action} = 'approve' THEN NOW() ELSE approved_at END, paid_at = CASE WHEN ${action} = 'pay' THEN NOW() ELSE paid_at END, rejected_at = CASE WHEN ${action} = 'reject' THEN NOW() ELSE rejected_at END, updated_at = NOW() WHERE id = ${id}
    `
    if (action === 'reject') {
      await tx`
        UPDATE users
        SET balance = ROUND(balance + ${current.requested_amount}::NUMERIC, 2), updated_at = NOW()
        WHERE id = ${current.writer_user_id}
      `
    }
    if (action === 'approve' || action === 'reject') {
      const approved = action === 'approve'
      const title = approved ? 'คำขอถอนเงินได้รับการอนุมัติ' : 'คำขอถอนเงินไม่ได้รับการอนุมัติ'
      const message = approved
        ? `คำขอถอนเงินจำนวน ${current.requested_amount} ได้รับการอนุมัติแล้ว${note ? `\nหมายเหตุ: ${note}` : ''}`
        : `คำขอถอนเงินจำนวน ${current.requested_amount} ถูกปฏิเสธ และระบบได้คืนยอดเข้ายอดคงเหลือแล้ว\nเหตุผล: ${note}`
      await tx`
        INSERT INTO notifications (user_id, type, title, message, target_url, data)
        VALUES (
          ${current.writer_user_id},
          ${approved ? NOTIFICATION_TYPE.WITHDRAWAL_APPROVED : NOTIFICATION_TYPE.WITHDRAWAL_REJECTED},
          ${title},
          ${message},
          '/writer/withdrawals',
          ${JSON.stringify({ withdrawal_request_id: id, status: nextStatus })}::JSONB
        )
      `
    }
    await tx`INSERT INTO withdrawal_request_events (withdrawal_request_id, from_status, to_status, note, actor_user_id) VALUES (${id}, ${current.status}, ${nextStatus}, ${note || null}, ${adminId})`
    return tx<
      WithdrawalRow[]
    >`SELECT ${tx.unsafe(select)} FROM withdrawal_requests wr JOIN users u ON u.id = wr.writer_user_id LEFT JOIN users reviewer ON reviewer.id = wr.reviewed_by_user_id WHERE wr.id = ${id}`
  })
  return map(rows[0]!)
}

export async function getWithdrawalProofUrl(id: string) {
  const [row] = await db<
    { transfer_proof_key: string | null }[]
  >`SELECT transfer_proof_key FROM withdrawal_requests WHERE id = ${id}`
  if (!row?.transfer_proof_key) return null
  return createPrivateAssetUrl(row.transfer_proof_key, 'transfer-proof')
}
