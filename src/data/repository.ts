import type {
  ExpenseInput,
  GuestInput,
  Id,
  LedgerData,
  Member,
  MemberSession,
  PaymentInput,
  PinResult,
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

/** 這台裝置的成員憑證已失效（密碼在別的裝置改過） */
export class MemberSessionError extends Error {
  constructor() {
    super('登入已失效，請重新選擇自己並輸入密碼')
    this.name = 'MemberSessionError'
  }
}

/** 想記錄或刪除不是收給自己的付款 */
export class NotPayeeError extends Error {
  constructor() {
    super('只有收款人可以記錄或刪除這筆付款')
    this.name = 'NotPayeeError'
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

  /** 每位新成員都以 pin 為初始密碼 */
  createMembers(members: Pick<Member, 'name' | 'color' | 'sort_order'>[], pin: string): Promise<void>
  updateMember(id: Id, patch: MemberPatch): Promise<void>
  reorderMembers(orderedIds: Id[]): Promise<void>

  createSession(input: SessionInput, attendeeIds: Id[], guests: GuestInput[]): Promise<Session>
  updateSession(id: Id, patch: SessionPatch): Promise<void>
  deleteSession(id: Id): Promise<void>
  setAttendance(sessionId: Id, memberIds: Id[]): Promise<void>
  /** 以 guests 完整取代這場帶朋友的紀錄 */
  setGuests(sessionId: Id, guests: GuestInput[]): Promise<void>

  /** 寫入費用並以 shares 完整取代其分攤紀錄 */
  saveExpense(input: ExpenseInput, shares: ShareDue[]): Promise<Id>
  deleteExpense(id: Id): Promise<void>

  loginMember(memberId: Id, pin: string): Promise<PinResult>
  /** 成功時回傳新憑證，舊憑證（包括其他裝置的）一併失效 */
  changeMemberPin(memberId: Id, oldPin: string, newPin: string): Promise<PinResult>

  /** 收款人是 auth 的成員；憑證失效丟 MemberSessionError */
  createPayment(auth: MemberSession, input: PaymentInput): Promise<void>
  /** 任一筆不是收給 auth 的成員就整批不刪，丟 NotPayeeError */
  deletePayments(auth: MemberSession, ids: Id[]): Promise<void>
}
