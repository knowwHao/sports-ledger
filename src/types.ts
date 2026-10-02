export type Id = string

export interface Member {
  id: Id
  name: string
  color: string
  active: boolean
  sort_order: number
  created_at: string
}

export interface DefaultExpense {
  label: string
  amount?: number | null
}

export interface Sport {
  id: Id
  name: string
  emoji: string
  color: string
  default_expenses: DefaultExpense[]
  sort_order: number
  active: boolean
  created_at: string
}

export interface Session {
  id: Id
  /** null 表示年費、雜費等不屬於特定運動的場次 */
  sport_id: Id | null
  /** YYYY-MM-DD；年費／雜費等非打球場次為 null */
  play_date: string | null
  title: string | null
  location: string | null
  note: string
  locked: boolean
  created_at: string
}

export interface Attendance {
  session_id: Id
  member_id: Id
}

/** 成員帶來的朋友：不建成員，費用算在帶他來的成員身上；成員本人沒出席也可以帶（名額讓給朋友） */
export interface SessionGuest {
  session_id: Id
  member_id: Id
  guests: number
  /** 朋友名字，選填 */
  names: string
}

export type GuestInput = Pick<SessionGuest, 'member_id' | 'guests' | 'names'>

export interface Expense {
  id: Id
  session_id: Id
  label: string
  amount: number
  payer_member_id: Id
  created_at: string
}

export interface ExpenseShare {
  expense_id: Id
  member_id: Id
  amount_due: number
}

/** topup＝儲值：付給保管人（通常是訂場地的人）先放著，之後他墊付的費用依時間先後從裡面扣 */
export type PaymentKind = 'payment' | 'topup'

export interface Payment {
  id: Id
  from_member_id: Id
  to_member_id: Id
  amount: number
  paid_at: string
  /** 直接付給該場墊付者時才填 */
  session_id: Id | null
  note: string
  kind: PaymentKind
  created_at: string
}

export interface Settings {
  team_name: string
  team_token: string
  updated_at: string
}

/** 畫面所需的整份帳本 */
export interface LedgerData {
  team_name: string
  updated_at: string
  sports: Sport[]
  members: Member[]
  sessions: Session[]
  attendances: Attendance[]
  guests: SessionGuest[]
  expenses: Expense[]
  shares: ExpenseShare[]
  payments: Payment[]
}

export interface SessionInput {
  sport_id: Id | null
  play_date: string | null
  title: string | null
  location: string | null
  note: string
}

export interface ExpenseInput {
  id?: Id
  session_id: Id
  label: string
  amount: number
  payer_member_id: Id
}

export type SportInput = Pick<Sport, 'name' | 'emoji' | 'color' | 'default_expenses'>

/** 收款人一律是登入的成員本人，所以不含 to_member_id */
export type PaymentInput = Pick<Payment, 'from_member_id' | 'amount' | 'paid_at' | 'session_id' | 'note' | 'kind'>

/** 成員輸入密碼後發給這台裝置的憑證，記錄或刪除付款時帶上 */
export interface MemberSession {
  memberId: Id
  key: string
}

/** 驗證密碼的結果；失敗時帶剩餘次數，或已被鎖定到何時 */
export type PinResult = { ok: true; key: string } | { ok: false; remaining?: number; lockedUntil?: string }

export interface PaymentPreset {
  from?: Id
  amount?: number
  sessionId?: Id | null
  title?: string
  /** 鎖住付款人，只讓使用者改金額 */
  fixedParties?: boolean
  kind?: PaymentKind
}
