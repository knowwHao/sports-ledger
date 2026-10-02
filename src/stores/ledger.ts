import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { repo } from '@/data'
import { InvalidTokenError, MemberSessionError, type SessionPatch, type SportPatch } from '@/data/repository'
import type { Expense, ExpenseShare, GuestInput, Id, LedgerData, Member, MemberSession, PaymentInput, SessionInput, SportInput } from '@/types'
import { computeDues, sessionCoverage, type Transfer } from '@/lib/balance'
import { attendeeIds, indexLedger, partyHeads, sessionGuests, sortedMembers, sortedSessions, sortedSports, summarize } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'
import { pickColor } from '@/lib/avatar'
import { useAccessStore } from './access'
import { currentSession, logout } from '@/composables/useWhoAmI'

/** 一筆費用的完整輸入；participantIds 已依出席名單解析好 */
export interface ExpenseRowInput {
  id?: Id
  label: string
  amount: number
  payer_member_id: Id
  participantIds: Id[]
}

const EMPTY: LedgerData = {
  team_name: '',
  updated_at: new Date(0).toISOString(),
  sports: [],
  members: [],
  sessions: [],
  attendances: [],
  guests: [],
  expenses: [],
  shares: [],
  payments: [],
}

function sameSet(a: Id[], b: Id[]) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

const shareKey = (s: { member_id: Id; amount_due: number }) => `${s.member_id}:${s.amount_due}`
const guestKey = (g: GuestInput) => `${g.member_id}:${g.guests}:${g.names}`

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

  /** 以假設的新費用與分攤重算當場付款，找出會溢付或失去對應的付款 */
  function coverageWarnings(sessionId: Id, expenses: Expense[], shares: ExpenseShare[]): string[] {
    const after = sessionCoverage({ expenses, shares, payments: data.value.payments }, sessionId)
    const warnings: string[] = []
    for (const p of after) {
      if (p.paid > p.due) {
        warnings.push(
          `${nameOf(p.member_id)} 在這場已付給 ${nameOf(p.payer_id)} ${formatMoney(p.paid)}，超過新的應付 ${formatMoney(p.due)}，多出的 ${formatMoney(p.paid - p.due)} 會算進他的整體帳`,
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
      warnings.push(`${nameOf(from)} 在這場已付給 ${nameOf(to)} ${formatMoney(amount)}，但已不用分這筆，這筆會算進他的整體帳`)
    }
    return warnings
  }

  async function createMembers(names: string[], pin: string) {
    const existing = new Set(data.value.members.map((m) => m.name))
    const fresh = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter((n) => !existing.has(n))
    if (!fresh.length) return { added: 0, skipped: names.length }
    const base = data.value.members.length
    await mutate(() =>
      repo.createMembers(
        fresh.map((name, i) => ({ name, color: pickColor(base + i), sort_order: base + i })),
        pin,
      ),
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

  async function createSession(input: SessionInput, attendees: Id[], guests: GuestInput[], rows: ExpenseRowInput[] = []) {
    const heads = partyHeads(attendees, guests)
    return mutate(async () => {
      const session = await repo.createSession(input, attendees, guests)
      for (const { label, amount, payer_member_id, participantIds } of rows) {
        await repo.saveExpense(
          { session_id: session.id, label, amount, payer_member_id },
          computeDues(amount, participantIds, heads).shares,
        )
      }
      return session
    })
  }

  /** 假設把這場的出席、朋友與費用整批換掉，列出會受影響的當場付款 */
  function sessionEditWarnings(sessionId: Id, attendees: Id[], guests: GuestInput[], rows: ExpenseRowInput[]): string[] {
    const heads = partyHeads(attendees, guests)
    const expenses: Expense[] = []
    const shares: ExpenseShare[] = []
    rows.forEach((r, i) => {
      const id = r.id ?? `__draft${i}`
      expenses.push({ id, session_id: sessionId, label: r.label, amount: r.amount, payer_member_id: r.payer_member_id, created_at: '' })
      for (const s of computeDues(r.amount, r.participantIds, heads).shares) shares.push({ ...s, expense_id: id })
    })
    return coverageWarnings(sessionId, expenses, shares)
  }

  /** 一次更新場次資訊、出席、朋友與整批費用；rows 沒列到的既有費用會被刪除 */
  async function saveSessionEdit(id: Id, input: SessionInput, attendees: Id[], guests: GuestInput[], rows: ExpenseRowInput[]) {
    const existing = data.value.expenses.filter((e) => e.session_id === id)
    const keep = new Set(rows.map((r) => r.id).filter(Boolean))
    const heads = partyHeads(attendees, guests)
    const guestsChanged = !sameSet(sessionGuests(data.value, id).map(guestKey), guests.map(guestKey))
    await mutate(async () => {
      await repo.updateSession(id, input)
      if (!sameSet(attendeeIds(data.value, id), attendees)) await repo.setAttendance(id, attendees)
      if (guestsChanged) await repo.setGuests(id, guests)
      for (const e of existing) if (!keep.has(e.id)) await repo.deleteExpense(e.id)
      for (const r of rows) {
        const { label, amount, payer_member_id, participantIds } = r
        const shares = computeDues(amount, participantIds, heads).shares
        const old = r.id ? existing.find((e) => e.id === r.id) : undefined
        // 朋友人數改了時分攤名單不變但金額會變，所以比對的是每人應付
        const unchanged =
          old &&
          old.label === label &&
          old.amount === amount &&
          old.payer_member_id === payer_member_id &&
          sameSet(sharesOf(old.id).map(shareKey), shares.map(shareKey))
        if (unchanged) continue
        await repo.saveExpense({ id: r.id, session_id: id, label, amount, payer_member_id }, shares)
      }
    })
  }

  async function updateSession(id: Id, patch: SessionPatch) {
    await mutate(() => repo.updateSession(id, patch))
  }

  async function deleteSession(id: Id) {
    await mutate(() => repo.deleteSession(id))
  }


  /** 付款只有收款人本人能記，所以一律以登入的成員身分寫入；憑證失效時順便登出 */
  async function asPayee<T>(payeeId: Id | null, fn: (auth: MemberSession) => Promise<T>): Promise<T> {
    const auth = currentSession()
    if (!auth) throw new Error('請先在右上角選擇你自己並輸入密碼')
    if (payeeId && payeeId !== auth.memberId) throw new Error(`只有 ${nameOf(payeeId)} 本人可以記錄收到這筆錢`)
    try {
      return await mutate(() => fn(auth))
    } catch (e) {
      if (e instanceof MemberSessionError) logout()
      throw e
    }
  }

  async function createPayment(input: PaymentInput) {
    if (input.amount <= 0) throw new Error('金額必須大於 0')
    if (input.from_member_id === currentSession()?.memberId) throw new Error('付款人與收款人不能是同一人')
    if (input.kind === 'topup' && input.session_id) throw new Error('儲值不能指定場次')
    await asPayee(null, (auth) => repo.createPayment(auth, input))
  }

  /** ids 必須都是收給登入者的付款 */
  async function deletePayments(ids: Id[]) {
    await asPayee(null, (auth) => repo.deletePayments(auth, ids))
  }

  async function recordTransfer(t: Transfer) {
    await asPayee(t.to, (auth) =>
      repo.createPayment(auth, {
        from_member_id: t.from,
        amount: t.amount,
        paid_at: new Date().toISOString(),
        session_id: null,
        note: '轉帳建議',
        kind: 'payment',
      }),
    )
  }

  async function payDirect(sessionId: Id, from: Id, to: Id, amount: number) {
    await asPayee(to, (auth) =>
      repo.createPayment(auth, {
        from_member_id: from,
        amount,
        paid_at: new Date().toISOString(),
        session_id: sessionId,
        note: '',
        kind: 'payment',
      }),
    )
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
    sessionEditWarnings,
    saveSessionEdit,
    createPayment,
    deletePayments,
    recordTransfer,
    payDirect,
    updateTeamName,
  }
})
