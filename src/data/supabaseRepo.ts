import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { AuthUser, ExpenseInput, Id, LedgerData, Member, PaymentInput, Session, SessionInput, Settings, SportInput } from '@/types'
import type { ShareDue } from '@/lib/balance'
import type { LedgerRepository, MemberPatch, SessionPatch, SportPatch } from './repository'

function toAuthUser(u: User | null | undefined): AuthUser | null {
  return u ? { id: u.id, email: u.email ?? null } : null
}

/** 查詢成功時 data 必定有值；寫入類操作的回傳值不會被使用 */
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials': '帳號或密碼錯誤',
  'Email not confirmed': '這個帳號的 Email 尚未驗證',
}

export class SupabaseRepo implements LedgerRepository {
  readonly mode = 'supabase' as const
  private sb: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pbl-auth' },
    })
  }

  async getUser() {
    const { data } = await this.sb.auth.getSession()
    return toAuthUser(data.session?.user)
  }

  async isAdmin() {
    const user = await this.getUser()
    if (!user) return false
    const { data, error } = await this.sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (error) throw new Error(error.message)
    return !!data
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(AUTH_ERRORS[error.message] ?? error.message)
  }

  async signOut() {
    const { error } = await this.sb.auth.signOut()
    if (error) throw new Error(error.message)
  }

  onAuthChange(cb: (u: AuthUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => cb(toAuthUser(session?.user)))
    return () => data.subscription.unsubscribe()
  }

  async loadLedger(): Promise<LedgerData> {
    const [settings, sports, members, sessions, attendances, expenses, shares, payments] = await Promise.all([
      this.sb.from('settings').select('team_name, updated_at').eq('id', 1).single(),
      this.sb.from('sports').select('*').order('sort_order'),
      this.sb.from('members').select('*').order('sort_order'),
      this.sb.from('sessions').select('*'),
      this.sb.from('attendances').select('session_id, member_id'),
      this.sb.from('expenses').select('*'),
      this.sb.from('expense_shares').select('expense_id, member_id, amount_due'),
      this.sb.from('payments').select('*'),
    ])
    const s = check(settings)
    return {
      team_name: s.team_name,
      updated_at: s.updated_at,
      sports: check(sports),
      members: check(members),
      sessions: check(sessions),
      attendances: check(attendances),
      expenses: check(expenses),
      shares: check(shares),
      payments: check(payments),
    }
  }

  async getSettings(): Promise<Settings> {
    return check(await this.sb.from('settings').select('team_name, share_token, updated_at').eq('id', 1).single())
  }

  async updateTeamName(name: string) {
    check(await this.sb.from('settings').update({ team_name: name }).eq('id', 1))
  }

  async regenerateShareToken() {
    return check(await this.sb.rpc('regenerate_share_token')) as string
  }

  async createSport(input: SportInput & { sort_order: number }) {
    check(await this.sb.from('sports').insert(input))
  }

  async updateSport(id: Id, patch: SportPatch) {
    check(await this.sb.from('sports').update(patch).eq('id', id))
  }

  async createMembers(members: Pick<Member, 'name' | 'color' | 'sort_order'>[]) {
    check(await this.sb.from('members').insert(members))
  }

  async updateMember(id: Id, patch: MemberPatch) {
    check(await this.sb.from('members').update(patch).eq('id', id))
  }

  async reorderMembers(orderedIds: Id[]) {
    await Promise.all(
      orderedIds.map(async (id, i) => check(await this.sb.from('members').update({ sort_order: i }).eq('id', id))),
    )
  }

  async createSession(input: SessionInput, attendeeIds: Id[]): Promise<Session> {
    const session = check(await this.sb.from('sessions').insert(input).select().single()) as Session
    if (attendeeIds.length) {
      check(await this.sb.from('attendances').insert(attendeeIds.map((member_id) => ({ session_id: session.id, member_id }))))
    }
    return session
  }

  async updateSession(id: Id, patch: SessionPatch) {
    check(await this.sb.from('sessions').update(patch).eq('id', id))
  }

  async deleteSession(id: Id) {
    check(await this.sb.from('sessions').delete().eq('id', id))
  }

  async setAttendance(sessionId: Id, memberIds: Id[]) {
    const current = check(await this.sb.from('attendances').select('member_id').eq('session_id', sessionId)) as {
      member_id: Id
    }[]
    const want = new Set(memberIds)
    const have = new Set(current.map((a) => a.member_id))
    const toAdd = memberIds.filter((id) => !have.has(id))
    const toRemove = [...have].filter((id) => !want.has(id))
    if (toAdd.length) {
      check(await this.sb.from('attendances').insert(toAdd.map((member_id) => ({ session_id: sessionId, member_id }))))
    }
    if (toRemove.length) {
      check(await this.sb.from('attendances').delete().eq('session_id', sessionId).in('member_id', toRemove))
    }
  }

  async saveExpense(input: ExpenseInput, shares: ShareDue[]) {
    const { id, ...fields } = input
    const res = id
      ? await this.sb.from('expenses').update(fields).eq('id', id).select('id').single()
      : await this.sb.from('expenses').insert(fields).select('id').single()
    const expenseId = check(res as { data: { id: Id } | null; error: { message: string } | null }).id
    // 先 upsert 再刪多餘的，中途失敗時最多殘留舊分攤，不會整筆分攤消失
    if (shares.length) {
      check(
        await this.sb
          .from('expense_shares')
          .upsert(shares.map((s) => ({ ...s, expense_id: expenseId })), { onConflict: 'expense_id,member_id' }),
      )
    }
    const keep = shares.map((s) => s.member_id)
    let del = this.sb.from('expense_shares').delete().eq('expense_id', expenseId)
    if (keep.length) del = del.not('member_id', 'in', `(${keep.join(',')})`)
    check(await del)
    return expenseId
  }

  async deleteExpense(id: Id) {
    check(await this.sb.from('expenses').delete().eq('id', id))
  }

  async createPayments(payments: PaymentInput[]) {
    if (payments.length) check(await this.sb.from('payments').insert(payments))
  }

  async deletePayments(ids: Id[]) {
    if (ids.length) check(await this.sb.from('payments').delete().in('id', ids))
  }

  async getPublicLedger(token: string) {
    const data = check(await this.sb.rpc('get_public_ledger', { p_token: token }))
    return (data as LedgerData | null) ?? null
  }
}
