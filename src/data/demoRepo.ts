import type { AuthUser, ExpenseInput, Id, LedgerData, Member, PaymentInput, Session, SessionInput, Settings, SportInput } from '@/types'
import type { ShareDue } from '@/lib/balance'
import type { LedgerRepository, MemberPatch, SessionPatch, SportPatch } from './repository'
import { createDemoDb, randomId, randomToken, type DemoDb } from './demoSeed'

const DB_KEY = 'pbl-demo-db-v2'
const AUTH_KEY = 'pbl-demo-auth'
const DEMO_USER: AuthUser = { id: 'demo-admin', email: 'demo@example.com' }

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
  private listeners = new Set<(u: AuthUser | null) => void>()

  constructor() {
    this.db = this.read() ?? this.persist(createDemoDb())
  }

  private read(): DemoDb | null {
    const raw = readStorage(DB_KEY)
    if (!raw) return null
    try {
      const db = JSON.parse(raw) as DemoDb
      return Array.isArray(db.payments) && Array.isArray(db.sports) ? db : null
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

  reset() {
    this.db = this.persist(createDemoDb())
  }

  private get signedIn() {
    return readStorage(AUTH_KEY) !== '0'
  }

  async getUser() {
    return this.signedIn ? DEMO_USER : null
  }

  async isAdmin() {
    return this.signedIn
  }

  async signIn() {
    writeStorage(AUTH_KEY, '1')
    this.listeners.forEach((cb) => cb(DEMO_USER))
  }

  async signOut() {
    writeStorage(AUTH_KEY, '0')
    this.listeners.forEach((cb) => cb(null))
  }

  onAuthChange(cb: (u: AuthUser | null) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  async loadLedger(): Promise<LedgerData> {
    const { settings, sports, members, sessions, attendances, expenses, shares, payments } = this.db
    return this.clone({
      team_name: settings.team_name,
      updated_at: settings.updated_at,
      sports,
      members,
      sessions,
      attendances,
      expenses,
      shares,
      payments,
    })
  }

  async getSettings(): Promise<Settings> {
    return this.clone(this.db.settings)
  }

  async updateTeamName(name: string) {
    this.db.settings.team_name = name
    this.commit()
  }

  async regenerateShareToken() {
    this.db.settings.share_token = randomToken()
    this.commit()
    return this.db.settings.share_token
  }

  async createSport(input: SportInput & { sort_order: number }) {
    this.db.sports.push({ ...input, id: randomId(), active: true, created_at: new Date().toISOString() })
    this.commit()
  }

  async updateSport(id: Id, patch: SportPatch) {
    const s = this.db.sports.find((x) => x.id === id)
    if (!s) throw new Error('找不到運動')
    Object.assign(s, patch)
    this.commit()
  }

  async createMembers(input: Pick<Member, 'name' | 'color' | 'sort_order'>[]) {
    const now = new Date().toISOString()
    for (const m of input) this.db.members.push({ ...m, id: randomId(), active: true, created_at: now })
    this.commit()
  }

  async updateMember(id: Id, patch: MemberPatch) {
    const m = this.db.members.find((x) => x.id === id)
    if (!m) throw new Error('找不到成員')
    Object.assign(m, patch)
    this.commit()
  }

  async reorderMembers(orderedIds: Id[]) {
    orderedIds.forEach((id, i) => {
      const m = this.db.members.find((x) => x.id === id)
      if (m) m.sort_order = i
    })
    this.commit()
  }

  async createSession(input: SessionInput, attendeeIds: Id[]): Promise<Session> {
    const session: Session = { ...input, id: randomId(), locked: false, created_at: new Date().toISOString() }
    this.db.sessions.push(session)
    attendeeIds.forEach((member_id) => this.db.attendances.push({ session_id: session.id, member_id }))
    this.commit()
    return this.clone(session)
  }

  async updateSession(id: Id, patch: SessionPatch) {
    const s = this.db.sessions.find((x) => x.id === id)
    if (!s) throw new Error('找不到場次')
    Object.assign(s, patch)
    this.commit()
  }

  async deleteSession(id: Id) {
    const expenseIds = new Set(this.db.expenses.filter((e) => e.session_id === id).map((e) => e.id))
    this.db.shares = this.db.shares.filter((s) => !expenseIds.has(s.expense_id))
    this.db.expenses = this.db.expenses.filter((e) => e.session_id !== id)
    this.db.attendances = this.db.attendances.filter((a) => a.session_id !== id)
    this.db.payments = this.db.payments.filter((p) => p.session_id !== id)
    this.db.sessions = this.db.sessions.filter((s) => s.id !== id)
    this.commit()
  }

  async setAttendance(sessionId: Id, memberIds: Id[]) {
    this.db.attendances = this.db.attendances.filter((a) => a.session_id !== sessionId)
    memberIds.forEach((member_id) => this.db.attendances.push({ session_id: sessionId, member_id }))
    this.commit()
  }

  async saveExpense(input: ExpenseInput, shares: ShareDue[]) {
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
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id)
    this.db.expenses = this.db.expenses.filter((e) => e.id !== id)
    this.commit()
  }

  async createPayments(input: PaymentInput[]) {
    const now = new Date().toISOString()
    for (const p of input) this.db.payments.push({ ...p, id: randomId(), created_at: now })
    this.commit()
  }

  async deletePayments(ids: Id[]) {
    const drop = new Set(ids)
    this.db.payments = this.db.payments.filter((p) => !drop.has(p.id))
    this.commit()
  }

  async getPublicLedger(token: string) {
    if (token !== this.db.settings.share_token) return null
    return this.loadLedger()
  }
}
