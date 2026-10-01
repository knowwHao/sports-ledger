import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ExpenseInput, Id, LedgerData, Member, PaymentInput, Session, SessionInput, SportInput } from '@/types'
import type { ShareDue } from '@/lib/balance'
import { InvalidTokenError, type LedgerRepository, type MemberPatch, type SessionPatch, type SportPatch } from './repository'

/** 查詢成功時 data 必定有值；寫入類操作的回傳值不會被使用 */
function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  // 42501：RLS 擋下寫入或 regenerate_team_token 拒絕，代表 token 已失效
  if (res.error?.code === '42501') throw new InvalidTokenError()
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export class SupabaseRepo implements LedgerRepository {
  readonly mode = 'supabase' as const
  private sb: SupabaseClient

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {
    this.sb = this.createClient(null)
  }

  private createClient(token: string | null) {
    return createClient(this.url, this.anonKey, {
      // 不使用 Supabase Auth；不保存 session，換 token 重建 client 時才不會搶同一份 storage
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // schema.sql 的 team_token_ok() 從這個 header 比對 token
      global: { headers: token ? { 'x-team-token': token } : {} },
    })
  }

  setTeamToken(token: string | null) {
    this.sb = this.createClient(token)
  }

  async loadLedger(): Promise<LedgerData> {
    const [settings, sports, members, sessions, attendances, expenses, shares, payments] = await Promise.all([
      this.sb.from('settings').select('team_name, updated_at').eq('id', 1).maybeSingle(),
      this.sb.from('sports').select('*').order('sort_order'),
      this.sb.from('members').select('*').order('sort_order'),
      this.sb.from('sessions').select('*'),
      this.sb.from('attendances').select('session_id, member_id'),
      this.sb.from('expenses').select('*'),
      this.sb.from('expense_shares').select('expense_id, member_id, amount_due'),
      this.sb.from('payments').select('*'),
    ])
    // token 不符時 RLS 讓每張表都回 0 筆而不是報錯，以 settings 那一列是否存在判斷
    const s = check(settings)
    if (!s) throw new InvalidTokenError()
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

  async updateTeamName(name: string) {
    check(await this.sb.from('settings').update({ team_name: name }).eq('id', 1))
  }

  async regenerateTeamToken() {
    return check(await this.sb.rpc('regenerate_team_token')) as string
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
}
