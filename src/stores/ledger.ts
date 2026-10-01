import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repo } from '@/data'
import { InvalidTokenError, type SessionPatch, type SportPatch } from '@/data/repository'
import type { Expense, ExpenseShare, Id, LedgerData, Member, PaymentInput, SessionInput, SportInput } from '@/types'
import { computeDues, sessionCoverage, type DueSplit, type Transfer } from '@/lib/balance'
import { attendeeIds, indexLedger, sortedMembers, sortedSessions, sortedSports, summarize } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'
import { pickColor } from '@/lib/avatar'
import { useAccessStore } from './access'

export interface ExpenseDraft {
  id?: Id
  session_id: Id
  label: string
  amount: number
  payer_member_id: Id
  participantIds: Id[]
}

export interface NewExpenseRow {
  label: string
  amount: number
  payer_member_id: Id
}

export interface AttendancePlan {
  sessionId: Id
  memberIds: Id[]
  updates: { expense: Expense; split: DueSplit }[]
  warnings: string[]
}

const EMPTY: LedgerData = {
  team_name: '',
  updated_at: new Date(0).toISOString(),
  sports: [],
  members: [],
  sessions: [],
  attendances: [],
  expenses: [],
  shares: [],
  payments: [],
}

function sameSet(a: Id[], b: Id[]) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

export const useLedgerStore = defineStore('ledger', () => {
  const data = ref<LedgerData>(EMPTY)
  const loaded = ref(false)
  const loading = ref(false)

  const idx = computed(() => indexLedger(data.value))
  const members = computed(() => sortedMembers(data.value.members))
  const activeMembers = computed(() => members.value.filter((m) => m.active))
  const sports = computed(() => sortedSports(data.value.sports))
  const activeSports = computed(() => sports.value.filter((s) => s.active))
  const sessions = computed(() => sortedSessions(data.value.sessions))
  const summary = computed(() => summarize(data.value))

  let loadSeq = 0

  async function refresh() {
    // 換 token 時舊請求可能較晚回來，只採用最後一次的結果
    const my = ++loadSeq
    loading.value = true
    try {
      const next = await repo.loadLedger()
      if (my === loadSeq) {
        data.value = next
        loaded.value = true
      }
    } catch (e) {
      if (my === loadSeq && e instanceof InvalidTokenError) useAccessStore().markInvalid()
      throw e
    } finally {
      if (my === loadSeq) loading.value = false
    }
  }

  /** 換 token 前清掉舊帳本，避免新連結短暫看到舊資料 */
  function reset() {
    loadSeq++
    data.value = EMPTY
    loaded.value = false
    loading.value = false
  }

  async function ensureLoaded() {
    if (!loaded.value) await refresh()
  }

  async function mutate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } finally {
      await refresh().catch(() => undefined)
    }
  }

  function sharesOf(expenseId: Id): ExpenseShare[] {
    return data.value.shares.filter((s) => s.expense_id === expenseId)
  }

  const nameOf = (id: Id) => idx.value.member(id).name

  /** 以假設的新分攤重算同場直接付款，找出會溢付或失去對應的付款 */
  function coverageWarnings(sessionId: Id, replaced: Map<Id, ExpenseShare[]>, expenseOverride?: Expense): string[] {
    const expenses = data.value.expenses.filter((e) => e.session_id === sessionId && e.id !== expenseOverride?.id)
    if (expenseOverride) expenses.push(expenseOverride)
    const shares = [
      ...data.value.shares.filter((s) => !replaced.has(s.expense_id)),
      ...[...replaced.values()].flat(),
    ]
    const after = sessionCoverage({ expenses, shares, payments: data.value.payments }, sessionId)
    const warnings: string[] = []
    for (const p of after) {
      if (p.paid > p.due) {
        warnings.push(
          `${nameOf(p.member_id)} 在本場已付給 ${nameOf(p.payer_id)} ${formatMoney(p.paid)}，超過新應付 ${formatMoney(p.due)}，多出的 ${formatMoney(p.paid - p.due)} 會計入他的餘額`,
        )
      }
    }
    const covered = new Set(after.map((p) => `${p.member_id}|${p.payer_id}`))
    const orphan = new Map<string, number>()
    for (const pay of data.value.payments) {
      if (pay.session_id !== sessionId) continue
      const key = `${pay.from_member_id}|${pay.to_member_id}`
      if (!covered.has(key)) orphan.set(key, (orphan.get(key) ?? 0) + pay.amount)
    }
    for (const [key, amount] of orphan) {
      const [from, to] = key.split('|')
      warnings.push(`${nameOf(from)} 在本場已付給 ${nameOf(to)} ${formatMoney(amount)}，但已不需分攤，這筆會計入他的餘額`)
    }
    return warnings
  }


  async function createMembers(names: string[]) {
    const existing = new Set(data.value.members.map((m) => m.name))
    const fresh = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter((n) => !existing.has(n))
    if (!fresh.length) return { added: 0, skipped: names.length }
    const base = data.value.members.length
    await mutate(() =>
      repo.createMembers(fresh.map((name, i) => ({ name, color: pickColor(base + i), sort_order: base + i }))),
    )
    return { added: fresh.length, skipped: names.length - fresh.length }
  }

  async function updateMember(id: Id, patch: Partial<Pick<Member, 'name' | 'color' | 'active'>>) {
    await mutate(() => repo.updateMember(id, patch))
  }

  async function moveMember(id: Id, delta: -1 | 1) {
    const list = members.value.map((m) => m.id)
    const i = list.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    await mutate(() => repo.reorderMembers(list))
  }


  async function createSport(input: SportInput) {
    await mutate(() => repo.createSport({ ...input, sort_order: data.value.sports.length }))
  }

  async function updateSport(id: Id, patch: SportPatch) {
    await mutate(() => repo.updateSport(id, patch))
  }

  async function moveSport(id: Id, delta: -1 | 1) {
    const list = sports.value.map((s) => s.id)
    const i = list.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    await mutate(() => Promise.all(list.map((sid, order) => repo.updateSport(sid, { sort_order: order }))))
  }


  /** 同運動最近一場有日期的出席名單 */
  function lastAttendeeIds(sportId: Id | null): Id[] {
    const last = sessions.value.find((s) => s.play_date && s.sport_id === sportId)
    return last ? attendeeIds(data.value, last.id) : []
  }

  async function createSession(input: SessionInput, attendees: Id[], expenseRows: NewExpenseRow[] = []) {
    return mutate(async () => {
      const session = await repo.createSession(input, attendees)
      for (const row of expenseRows) {
        await repo.saveExpense({ session_id: session.id, ...row }, computeDues(row.amount, attendees).shares)
      }
      return session
    })
  }

  async function updateSession(id: Id, patch: SessionPatch) {
    await mutate(() => repo.updateSession(id, patch))
  }

  async function deleteSession(id: Id) {
    await mutate(() => repo.deleteSession(id))
  }

  /** 原本「全員分攤」的費用跟著出席名單走，其餘費用只移除缺席者 */
  function planAttendance(sessionId: Id, memberIds: Id[]): AttendancePlan {
    const before = attendeeIds(data.value, sessionId)
    const updates: AttendancePlan['updates'] = []
    const replaced = new Map<Id, ExpenseShare[]>()
    for (const expense of data.value.expenses.filter((e) => e.session_id === sessionId)) {
      const current = sharesOf(expense.id).map((s) => s.member_id)
      let next = sameSet(current, before) ? [...memberIds] : current.filter((id) => memberIds.includes(id))
      if (!next.length) next = [...memberIds]
      if (!next.length || sameSet(next, current)) continue
      const split = computeDues(expense.amount, next)
      updates.push({ expense, split })
      replaced.set(expense.id, split.shares.map((s) => ({ ...s, expense_id: expense.id })))
    }
    const warnings = updates.length ? coverageWarnings(sessionId, replaced) : []
    return { sessionId, memberIds, updates, warnings }
  }

  async function applyAttendance(plan: AttendancePlan) {
    await mutate(async () => {
      await repo.setAttendance(plan.sessionId, plan.memberIds)
      for (const { expense, split } of plan.updates) {
        const { id, session_id, label, amount, payer_member_id } = expense
        await repo.saveExpense({ id, session_id, label, amount, payer_member_id }, split.shares)
      }
    })
  }


  function previewExpense(draft: ExpenseDraft): DueSplit & { warnings: string[] } {
    const split = computeDues(draft.amount, draft.participantIds)
    const key = draft.id ?? '__draft__'
    const override: Expense = {
      id: key,
      session_id: draft.session_id,
      label: draft.label,
      amount: draft.amount,
      payer_member_id: draft.payer_member_id,
      created_at: '',
    }
    const replaced = new Map([[key, split.shares.map((s) => ({ ...s, expense_id: key }))]])
    return { ...split, warnings: coverageWarnings(draft.session_id, replaced, override) }
  }

  async function saveExpense(draft: ExpenseDraft) {
    const split = computeDues(draft.amount, draft.participantIds)
    const { id, session_id, label, amount, payer_member_id } = draft
    await mutate(() => repo.saveExpense({ id, session_id, label, amount, payer_member_id }, split.shares))
    return split
  }

  async function deleteExpense(id: Id) {
    await mutate(() => repo.deleteExpense(id))
  }


  async function createPayment(input: PaymentInput) {
    if (input.amount <= 0) throw new Error('金額必須大於 0')
    if (input.from_member_id === input.to_member_id) throw new Error('付款人與收款人不能是同一人')
    await mutate(() => repo.createPayments([input]))
  }

  async function deletePayments(ids: Id[]) {
    await mutate(() => repo.deletePayments(ids))
  }

  async function recordTransfer(t: Transfer) {
    await createPayment({
      from_member_id: t.from,
      to_member_id: t.to,
      amount: t.amount,
      paid_at: new Date().toISOString(),
      session_id: null,
      note: '結算建議',
    })
  }

  async function payDirect(sessionId: Id, from: Id, to: Id, amount: number) {
    await createPayment({
      from_member_id: from,
      to_member_id: to,
      amount,
      paid_at: new Date().toISOString(),
      session_id: sessionId,
      note: '',
    })
  }


  async function updateTeamName(name: string) {
    await mutate(() => repo.updateTeamName(name))
  }

  return {
    data,
    loaded,
    loading,
    idx,
    members,
    activeMembers,
    sports,
    activeSports,
    sessions,
    summary,
    refresh,
    reset,
    ensureLoaded,
    sharesOf,
    createMembers,
    updateMember,
    moveMember,
    createSport,
    updateSport,
    moveSport,
    lastAttendeeIds,
    createSession,
    updateSession,
    deleteSession,
    planAttendance,
    applyAttendance,
    previewExpense,
    saveExpense,
    deleteExpense,
    createPayment,
    deletePayments,
    recordTransfer,
    payDirect,
    updateTeamName,
  }
})
