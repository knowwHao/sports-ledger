import type {
  ExpenseInput,
  Id,
  LedgerData,
  Member,
  PaymentInput,
  Session,
  SessionInput,
  Sport,
  SportInput,
} from '@/types'
import type { ShareDue } from '@/lib/balance'

export type RepoMode = 'demo' | 'supabase'

export type MemberPatch = Partial<Pick<Member, 'name' | 'color' | 'active' | 'sort_order'>>
export type SportPatch = Partial<SportInput & Pick<Sport, 'active' | 'sort_order'>>
export type SessionPatch = Partial<SessionInput & { locked: boolean }>

/** 球隊 token 不符（沒帶、打錯或已被重新產生） */
export class InvalidTokenError extends Error {
  constructor() {
    super('球隊連結已失效')
    this.name = 'InvalidTokenError'
  }
}

export interface LedgerRepository {
  readonly mode: RepoMode

  /** 之後的請求都以這個球隊 token 存取；null 表示還沒有球隊連結 */
  setTeamToken(token: string | null): void

  /** token 不符時丟 InvalidTokenError */
  loadLedger(): Promise<LedgerData>
  updateTeamName(name: string): Promise<void>
  /** 換發球隊 token 並回傳新值，舊連結立即失效 */
  regenerateTeamToken(): Promise<string>

  createSport(input: SportInput & { sort_order: number }): Promise<void>
  updateSport(id: Id, patch: SportPatch): Promise<void>

  createMembers(members: Pick<Member, 'name' | 'color' | 'sort_order'>[]): Promise<void>
  updateMember(id: Id, patch: MemberPatch): Promise<void>
  reorderMembers(orderedIds: Id[]): Promise<void>

  createSession(input: SessionInput, attendeeIds: Id[]): Promise<Session>
  updateSession(id: Id, patch: SessionPatch): Promise<void>
  deleteSession(id: Id): Promise<void>
  setAttendance(sessionId: Id, memberIds: Id[]): Promise<void>

  /** 寫入費用並以 shares 完整取代其分攤紀錄 */
  saveExpense(input: ExpenseInput, shares: ShareDue[]): Promise<Id>
  deleteExpense(id: Id): Promise<void>

  createPayments(payments: PaymentInput[]): Promise<void>
  deletePayments(ids: Id[]): Promise<void>
}
