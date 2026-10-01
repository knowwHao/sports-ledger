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

export interface Payment {
  id: Id
  from_member_id: Id
  to_member_id: Id
  amount: number
  paid_at: string
  /** 直接付給該場墊付者時才填 */
  session_id: Id | null
  note: string
  created_at: string
}

export interface Settings {
  team_name: string
  share_token: string
  updated_at: string
}

/** 畫面所需的整份帳本；分享頁拿到的是不含 share_token 的同結構資料 */
export interface LedgerData {
  team_name: string
  updated_at: string
  sports: Sport[]
  members: Member[]
  sessions: Session[]
  attendances: Attendance[]
  expenses: Expense[]
  shares: ExpenseShare[]
  payments: Payment[]
}

export interface AuthUser {
  id: Id
  email: string | null
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

export type PaymentInput = Pick<Payment, 'from_member_id' | 'to_member_id' | 'amount' | 'paid_at' | 'session_id' | 'note'>

export interface PaymentPreset {
  from?: Id
  to?: Id
  amount?: number
  sessionId?: Id | null
  title?: string
  /** 鎖住付款人與收款人，只讓使用者改金額 */
  fixedParties?: boolean
}
