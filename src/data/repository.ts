import type {
  AuthUser,
  ExpenseInput,
  Id,
  LedgerData,
  Member,
  PaymentInput,
  Session,
  SessionInput,
  Settings,
  Sport,
  SportInput,
} from '@/types'
import type { ShareDue } from '@/lib/balance'

export type RepoMode = 'demo' | 'supabase'

export type MemberPatch = Partial<Pick<Member, 'name' | 'color' | 'active' | 'sort_order'>>
export type SportPatch = Partial<SportInput & Pick<Sport, 'active' | 'sort_order'>>
export type SessionPatch = Partial<SessionInput & { locked: boolean }>

export interface LedgerRepository {
  readonly mode: RepoMode

  getUser(): Promise<AuthUser | null>
  isAdmin(): Promise<boolean>
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  onAuthChange(cb: (user: AuthUser | null) => void): () => void

  loadLedger(): Promise<LedgerData>
  getSettings(): Promise<Settings>
  updateTeamName(name: string): Promise<void>
  regenerateShareToken(): Promise<string>

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

  /** 分享頁用；token 不符回 null */
  getPublicLedger(token: string): Promise<LedgerData | null>
}
