import type { Expense, ExpenseShare, Id, LedgerData, Member, Payment, Session, Sport } from '@/types'
import {
  netBalances,
  nettedMembers,
  sessionSettlements,
  sessionStatuses,
  simplifyDebts,
  type SessionStatus,
  type SettleReason,
  type Transfer,
} from './balance'
import { sessionSortKey } from './format'

const FALLBACK_MEMBER: Member = {
  id: '',
  name: '（已刪除）',
  color: '#94a3b8',
  active: false,
  sort_order: 0,
  created_at: '',
}

export const OTHER_SPORT: Sport = {
  id: '',
  name: '其他',
  emoji: '🧾',
  color: '#64748b',
  default_expenses: [],
  sort_order: 9999,
  active: true,
  created_at: '',
}

export function indexLedger(data: LedgerData) {
  const members = new Map(data.members.map((m) => [m.id, m]))
  const sports = new Map(data.sports.map((s) => [s.id, s]))
  const sessions = new Map(data.sessions.map((s) => [s.id, s]))
  return {
    members,
    sports,
    sessions,
    member: (id: Id) => members.get(id) ?? { ...FALLBACK_MEMBER, id },
    sport: (id: Id | null) => (id && sports.get(id)) || OTHER_SPORT,
  }
}

export interface LedgerSummary {
  balances: Map<Id, number>
  transfers: Transfer[]
  settlements: Map<Id, SettleReason>
  /** 各場已個人事後打平的欠款者 */
  netted: Map<Id, Set<Id>>
  statuses: Map<Id, SessionStatus>
  /** 正餘額總和＝全隊尚待轉帳總額 */
  outstanding: number
}

export function summarize(data: LedgerData): LedgerSummary {
  const balances = netBalances(data)
  const transfers = simplifyDebts(balances)
  const netted = nettedMembers(data)
  const settlements = sessionSettlements(data, netted)
  return {
    balances,
    transfers,
    settlements,
    netted,
    statuses: sessionStatuses(data, settlements),
    outstanding: transfers.reduce((s, t) => s + t.amount, 0),
  }
}

export interface SessionTotals {
  total: number
  attendeeCount: number
  expenseCount: number
}

export function sessionTotals(data: LedgerData, sessionId: Id): SessionTotals {
  const expenses = data.expenses.filter((e) => e.session_id === sessionId)
  return {
    total: expenses.reduce((sum, e) => sum + e.amount, 0),
    attendeeCount: data.attendances.filter((a) => a.session_id === sessionId).length,
    expenseCount: expenses.length,
  }
}

export interface MemberSessionLine {
  session: Session
  expense: Expense
  share: ExpenseShare
  isPayer: boolean
}

/** 某成員參與分攤的所有費用，依場次新到舊 */
export function memberLines(data: LedgerData, memberId: Id): MemberSessionLine[] {
  const expenses = new Map(data.expenses.map((e) => [e.id, e]))
  const sessions = new Map(data.sessions.map((s) => [s.id, s]))
  const lines: MemberSessionLine[] = []
  for (const share of data.shares) {
    if (share.member_id !== memberId) continue
    const expense = expenses.get(share.expense_id)
    const session = expense && sessions.get(expense.session_id)
    if (!expense || !session) continue
    lines.push({ session, expense, share, isPayer: expense.payer_member_id === memberId })
  }
  return lines.sort(
    (a, b) => sessionSortKey(b.session).localeCompare(sessionSortKey(a.session)) || a.expense.created_at.localeCompare(b.expense.created_at),
  )
}

export function memberPayments(data: LedgerData, memberId: Id): Payment[] {
  return sortedPayments(data.payments.filter((p) => p.from_member_id === memberId || p.to_member_id === memberId))
}

/** 某成員墊付的費用總額 */
export function memberAdvanced(data: LedgerData, memberId: Id): number {
  return data.expenses.filter((e) => e.payer_member_id === memberId).reduce((s, e) => s + e.amount, 0)
}

export function sortedPayments(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))
}

export function sortedSessions(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)) || b.created_at.localeCompare(a.created_at),
  )
}

export function sortedMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

export function sortedSports(sports: Sport[]): Sport[] {
  return [...sports].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

export function attendeeIds(data: LedgerData, sessionId: Id): Id[] {
  return data.attendances.filter((a) => a.session_id === sessionId).map((a) => a.member_id)
}
