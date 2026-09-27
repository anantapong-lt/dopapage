import type { WithdrawalStatus } from '@/constants/withdrawal.constant'
import type { WriterBankAccount } from './writer-bank-account.interface'

export interface WriterWithdrawalRequest {
  id: string
  requested_amount: string
  commission_percent: string
  commission_amount: string
  net_amount: string
  bank_code: string
  account_number: string
  requested_at: string
  status: WithdrawalStatus
  note: string | null
  approved_at: string | null
  paid_at: string | null
  rejected_at: string | null
}

export interface WriterWithdrawalsResponse {
  balance: string
  total_sales: string
  commission_percent: string
  withdrawals_enabled: boolean
  bank_account: WriterBankAccount | null
  requests: WriterWithdrawalRequest[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

export interface CreateWriterWithdrawalResponse {
  request: WriterWithdrawalRequest
  balance: string
}
