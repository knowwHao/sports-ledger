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
  SportInput,
} from '@/types'
import type { ShareDue } from '@/lib/balance'
import { isValidPin, PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS } from '@/lib/pin'
import {
  InvalidTokenError,
  MemberSessionError,
  NotPayeeError,
  type LedgerRepository,
  type MemberPatch,
  type SessionPatch,
  type SportPatch,
} from './repository'
import { createDemoDb, newDemoPin, randomId, randomToken, type DemoDb } from './demoSeed'

const DB_KEY = 'pbl-demo-db-v2'

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 無痕模式或儲存空間被封鎖時仍可在記憶體中操作
  }
}

export class DemoRepo implements LedgerRepository {
  readonly mode = 'demo' as const
  private db: DemoDb
  private token: string | null = null

  constructor() {
    this.db = this.read() ?? this.persist(createDemoDb())
  }

  private read(): DemoDb | null {
    const raw = readStorage(DB_KEY)
    if (!raw) return null
    try {
      const db = JSON.parse(raw) as DemoDb
      if (!(Array.isArray(db.payments) && Array.isArray(db.sports) && typeof db.settings?.team_token === 'string')) return null
      // 加入密碼功能前存下的示範資料沒有 pins，與 schema.sql 一樣補上預設 0000
      db.pins ??= {}
      // 加入帶朋友功能前存下的示範資料沒有 guests
      db.guests ??= []
      // 加入儲值功能前的付款都是一般付款
      for (const p of db.payments) p.kind ??= 'payment'
      for (const m of db.members) db.pins[m.id] ??= newDemoPin()
      return db
    } catch {
      return null
    }
  }

  private persist(db: DemoDb): DemoDb {
    db.settings.updated_at = new Date().toISOString()
    writeStorage(DB_KEY, JSON.stringify(db))
    return db
  }

  private commit() {
    this.persist(this.db)
  }

  private clone<T>(v: T): T {
    return structuredClone(v)
  }

  /** 換一份新的示範資料，球隊 token 也會換新；回傳新 token */
  reset(): string {
    this.db = this.persist(createDemoDb())
    return this.db.settings.team_token
  }

  /** 示範資料目前的球隊 token，說明頁的「進入示範帳本」用 */
  get teamToken() {
    return this.db.settings.team_token
  }

  setTeamToken(token: string | null) {
    this.token = token
  }

  /** 模擬 Supabase RLS：token 不符就不給讀寫 */
  private guard() {
    if (this.token !== this.db.settings.team_token) throw new InvalidTokenError()
  }

  /** 模擬 schema.sql 的 require_member() */
  private guardMember(auth: MemberSession) {
    this.guard()
    if (this.db.pins[auth.memberId]?.key !== auth.key) throw new MemberSessionError()
  }

  /** 模擬 schema.sql 的 attempt_member_pin()：錯 5 次鎖 15 分鐘 */
  private attemptPin(memberId: Id, pin: string): PinResult {
    const p = this.db.pins[memberId]
    if (!p) throw new Error('找不到成員')
    if (p.locked_until && Date.parse(p.locked_until) > Date.now()) return { ok: false, lockedUntil: p.locked_until }
    if (p.pin === pin) {
      Object.assign(p, { failed: 0, locked_until: null })
      this.commit()
      return { ok: true, key: p.key }
    }
    p.failed += 1
    let result: PinResult = { ok: false, remaining: PIN_MAX_ATTEMPTS - p.failed }
    if (p.failed >= PIN_MAX_ATTEMPTS) {
      Object.assign(p, { failed: 0, locked_until: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString() })
      result = { ok: false, lockedUntil: p.locked_until! }
    }
    this.commit()
    return result
  }

  async loadLedger(): Promise<LedgerData> {
    this.guard()
    const { settings, sports, members, sessions, attendances, guests, expenses, shares, payments } = this.db
    return this.clone({
      team_name: settings.team_name,
      updated_at: settings.updated_at,
      sports,
      members,
      sessions,
      attendances,
      guests,
      expenses,
      shares,
      payments,
    })
  }

  async updateTeamName(name: string) {
    this.guard()
    this.db.settings.team_name = name
    this.commit()
  }

  async regenerateTeamToken() {
    this.guard()
    this.db.settings.team_token = randomToken()
    this.commit()
    return this.db.settings.team_token
  }

  async createSport(input: SportInput & { sort_order: number }) {
    this.guard()
    this.db.sports.push({ ...input, id: randomId(), active: true, created_at: new Date().toISOString() })
    this.commit()
  }

  async updateSport(id: Id, patch: SportPatch) {
    this.guard()
    const s = this.db.sports.find((x) => x.id === id)
    if (!s) throw new Error('找不到運動')
    Object.assign(s, patch)
    this.commit()
  }

  async createMembers(input: Pick<Member, 'name' | 'color' | 'sort_order'>[], pin: string) {
    this.guard()
    if (!isValidPin(pin)) throw new Error('密碼要是 4～8 位數字')
    const now = new Date().toISOString()
    for (const m of input) {
      const id = randomId()
      this.db.members.push({ ...m, id, active: true, created_at: now })
      this.db.pins[id] = newDemoPin(pin)
    }
    this.commit()
  }

  async updateMember(id: Id, patch: MemberPatch) {
    this.guard()
    const m = this.db.members.find((x) => x.id === id)
    if (!m) throw new Error('找不到成員')
    Object.assign(m, patch)
    this.commit()
  }

  async reorderMembers(orderedIds: Id[]) {
    this.guard()
    orderedIds.forEach((id, i) => {
      const m = this.db.members.find((x) => x.id === id)
      if (m) m.sort_order = i
    })
    this.commit()
  }

  async createSession(input: SessionInput, attendeeIds: Id[], guests: GuestInput[]): Promise<Session> {
    this.guard()
    const session: Session = { ...input, id: randomId(), locked: false, created_at: new Date().toISOString() }
    this.db.sessions.push(session)
    attendeeIds.forEach((member_id) => this.db.attendances.push({ session_id: session.id, member_id }))
    guests.forEach((g) => this.db.guests.push({ ...g, session_id: session.id }))
    this.commit()
    return this.clone(session)
  }

  async updateSession(id: Id, patch: SessionPatch) {
    this.guard()
    const s = this.db.sessions.find((x) => x.id === id)
    if (!s) throw new Error('找不到場次')
    Object.assign(s, patch)
    this.commit()
  }

  async deleteSession(id: Id) {
    this.guard()
    const expenseIds = new Set(this.db.expenses.filter((e) => e.session_id === id).map((e) => e.id))
    this.db.shares = this.db.shares.filter((s) => !expenseIds.has(s.expense_id))
    this.db.expenses = this.db.expenses.filter((e) => e.session_id !== id)
    this.db.attendances = this.db.attendances.filter((a) => a.session_id !== id)
    this.db.guests = this.db.guests.filter((g) => g.session_id !== id)
    this.db.payments = this.db.payments.filter((p) => p.session_id !== id)
    this.db.sessions = this.db.sessions.filter((s) => s.id !== id)
    this.commit()
  }

  async setAttendance(sessionId: Id, memberIds: Id[]) {
    this.guard()
    this.db.attendances = this.db.attendances.filter((a) => a.session_id !== sessionId)
    memberIds.forEach((member_id) => this.db.attendances.push({ session_id: sessionId, member_id }))
    this.commit()
  }

  async setGuests(sessionId: Id, guests: GuestInput[]) {
    this.guard()
    this.db.guests = this.db.guests.filter((g) => g.session_id !== sessionId)
    guests.forEach((g) => this.db.guests.push({ ...g, session_id: sessionId }))
    this.commit()
  }

  async saveExpense(input: ExpenseInput, shares: ShareDue[]) {
    this.guard()
    let expense = input.id ? this.db.expenses.find((e) => e.id === input.id) : undefined
    if (expense) {
      Object.assign(expense, input)
    } else {
      expense = { ...input, id: randomId(), created_at: new Date().toISOString() }
      this.db.expenses.push(expense)
    }
    const id = expense.id
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id)
    shares.forEach((s) => this.db.shares.push({ ...s, expense_id: id }))
    this.commit()
    return id
  }

  async deleteExpense(id: Id) {
    this.guard()
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id)
    this.db.expenses = this.db.expenses.filter((e) => e.id !== id)
    this.commit()
  }

  async loginMember(memberId: Id, pin: string) {
    this.guard()
    return this.attemptPin(memberId, pin)
  }

  async changeMemberPin(memberId: Id, oldPin: string, newPin: string) {
    this.guard()
    if (!isValidPin(newPin)) throw new Error('密碼要是 4～8 位數字')
    const result = this.attemptPin(memberId, oldPin)
    if (!result.ok) return result
    this.db.pins[memberId] = newDemoPin(newPin)
    this.commit()
    return { ok: true as const, key: this.db.pins[memberId].key }
  }

  async createPayment(auth: MemberSession, p: PaymentInput) {
    this.guardMember(auth)
    if (p.from_member_id === auth.memberId) throw new Error('付款人與收款人不能是同一人')
    // 模擬 schema.sql 的 payments_topup_no_session
    if (p.kind === 'topup' && p.session_id) throw new Error('儲值不能指定場次')
    const now = new Date().toISOString()
    this.db.payments.push({ ...p, to_member_id: auth.memberId, id: randomId(), created_at: now })
    this.commit()
  }

  async deletePayments(auth: MemberSession, ids: Id[]) {
    this.guardMember(auth)
    const drop = new Set(ids)
    if (this.db.payments.some((p) => drop.has(p.id) && p.to_member_id !== auth.memberId)) throw new NotPayeeError()
    this.db.payments = this.db.payments.filter((p) => !drop.has(p.id))
    this.commit()
  }
}
