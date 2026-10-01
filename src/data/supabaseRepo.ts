import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  ExpenseInput,
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
import {
  InvalidTokenError,
  MemberSessionError,
  NotPayeeError,
  type LedgerRepository,
  type MemberPatch,
  type SessionPatch,
  type SportPatch,
} from './repository'
import { verifyAffected, type OnMissing } from './writeCheck'

/** 查詢成功時 data 必定有值；沒接 .select() 的寫入 data 是 null，不可取用 */
function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  // 42501：RLS 擋下寫入或 regenerate_team_token 拒絕，代表 token 已失效
  if (res.error?.code === '42501') throw new InvalidTokenError()
  // SL401／SL403 是 schema.sql 的 require_member()、delete_payments() 自訂的錯誤碼
  if (res.error?.code === 'SL401') throw new MemberSessionError()
  if (res.error?.code === 'SL403') throw new NotPayeeError()
  if (res.error?.code === '22023') throw new Error('密碼要是 4～8 位數字')
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

function toPinResult(raw: { ok: boolean; key?: string; remaining?: number; locked_until?: string }): PinResult {
  return raw.ok && raw.key ? { ok: true, key: raw.key } : { ok: false, remaining: raw.remaining, lockedUntil: raw.locked_until }
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

  /** settings 那一列看得到就代表 token 仍有效 */
  private async tokenOk() {
    return check(await this.sb.from('settings').select('id').eq('id', 1).maybeSingle()) !== null
  }

  /** update／delete 須加 .select(…) 取回受影響的列，token 失效時才不會被當成成功 */
  private async expectAffected(
    res: { data: unknown[] | null; error: { message: string; code?: string } | null },
    onMissing: OnMissing,
  ) {
    await verifyAffected(check(res).length, onMissing, () => this.tokenOk())
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
    await this.expectAffected(await this.sb.from('settings').update({ team_name: name }).eq('id', 1).select('id'), 'fail')
  }

  async regenerateTeamToken() {
    return check(await this.sb.rpc('regenerate_team_token')) as string
  }

  async createSport(input: SportInput & { sort_order: number }) {
    check(await this.sb.from('sports').insert(input))
  }

  async updateSport(id: Id, patch: SportPatch) {
    await this.expectAffected(await this.sb.from('sports').update(patch).eq('id', id).select('id'), 'fail')
  }

  async createMembers(members: Pick<Member, 'name' | 'color' | 'sort_order'>[], pin: string) {
    check(await this.sb.rpc('create_members', { p_members: members, p_pin: pin }))
  }

  async updateMember(id: Id, patch: MemberPatch) {
    await this.expectAffected(await this.sb.from('members').update(patch).eq('id', id).select('id'), 'fail')
  }

  async reorderMembers(orderedIds: Id[]) {
    await Promise.all(
      orderedIds.map(async (id, i) =>
        this.expectAffected(await this.sb.from('members').update({ sort_order: i }).eq('id', id).select('id'), 'fail'),
      ),
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
    await this.expectAffected(await this.sb.from('sessions').update(patch).eq('id', id).select('id'), 'fail')
  }

  async deleteSession(id: Id) {
    await this.expectAffected(await this.sb.from('sessions').delete().eq('id', id).select('id'), 'ignore')
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
      await this.expectAffected(
        await this.sb.from('attendances').delete().eq('session_id', sessionId).in('member_id', toRemove).select('member_id'),
        'ignore',
      )
    }
  }

  async saveExpense(input: ExpenseInput, shares: ShareDue[]) {
    const { id, ...fields } = input
    let expenseId: Id
    if (id) {
      await this.expectAffected(await this.sb.from('expenses').update(fields).eq('id', id).select('id'), 'fail')
      expenseId = id
    } else {
      expenseId = (check(await this.sb.from('expenses').insert(fields).select('id').single()) as { id: Id }).id
    }
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
    // 沒有多餘分攤時本來就是 0 列；token 已由上面寫入 expenses 那一步確認過
    check(await del)
    return expenseId
  }

  async deleteExpense(id: Id) {
    await this.expectAffected(await this.sb.from('expenses').delete().eq('id', id).select('id'), 'ignore')
  }

  async loginMember(memberId: Id, pin: string) {
    return toPinResult(check(await this.sb.rpc('member_login', { p_member: memberId, p_pin: pin })))
  }

  async changeMemberPin(memberId: Id, oldPin: string, newPin: string) {
    return toPinResult(
      check(await this.sb.rpc('member_change_pin', { p_member: memberId, p_old_pin: oldPin, p_new_pin: newPin })),
    )
  }

  async createPayment(auth: MemberSession, p: PaymentInput) {
    check(
      await this.sb.rpc('create_payment', {
        p_member: auth.memberId,
        p_key: auth.key,
        p_from: p.from_member_id,
        p_amount: p.amount,
        p_paid_at: p.paid_at,
        p_session: p.session_id,
        p_note: p.note,
      }),
    )
  }

  async deletePayments(auth: MemberSession, ids: Id[]) {
    // 0 筆可能是已被刪掉，與其他 delete 一樣視為已達成；token 與憑證已由 RPC 檢查過
    if (ids.length) check(await this.sb.rpc('delete_payments', { p_member: auth.memberId, p_key: auth.key, p_ids: ids }))
  }
}
