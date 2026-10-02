import type { Expense, ExpenseShare, Id, LedgerData, Payment, Session } from '@/types'

export type ShareDue = Omit<ExpenseShare, 'expense_id'>

export interface DueSplit {
  shares: ShareDue[]
  perHead: number
  /** 無條件進位後墊付者多收的零頭 */
  surplus: number
}

export interface Transfer {
  from: Id
  to: Id
  amount: number
}

export type BalanceInput = Pick<LedgerData, 'members' | 'expenses' | 'shares' | 'payments'>

export function perHeadAmount(amount: number, headcount: number): number {
  return headcount > 0 ? Math.ceil(amount / headcount) : 0
}

/**
 * heads：每位成員要付幾人份（本人出席算 1，帶的朋友各算 1），沒列到的算 1；0 份的人不列入分攤
 * 每人份金額以總人份進位，成員應付＝每人份金額 × 他的人份
 */
export function computeDues(amount: number, participantIds: Id[], heads?: Map<Id, number>): DueSplit {
  const parties = [...new Set(participantIds)]
    .map((member_id) => ({ member_id, n: heads?.get(member_id) ?? 1 }))
    .filter((p) => p.n > 0)
  const total = parties.reduce((s, p) => s + p.n, 0)
  const perHead = perHeadAmount(amount, total)
  return {
    shares: parties.map((p) => ({ member_id: p.member_id, amount_due: perHead * p.n })),
    perHead,
    surplus: total ? perHead * total - amount : 0,
  }
}

function add(map: Map<Id, number>, id: Id, delta: number) {
  map.set(id, (map.get(id) ?? 0) + delta)
}

function applyExpense(bal: Map<Id, number>, expense: Expense, shares: ShareDue[]) {
  // 墊付者入帳的是分攤總額（含零頭）而非實付金額，全隊餘額加總才會恰好為 0
  for (const s of shares) {
    add(bal, expense.payer_member_id, s.amount_due)
    add(bal, s.member_id, -s.amount_due)
  }
}

function applyPayment(bal: Map<Id, number>, p: Payment) {
  add(bal, p.from_member_id, p.amount)
  add(bal, p.to_member_id, -p.amount)
}

function groupShares(shares: ExpenseShare[]): Map<Id, ShareDue[]> {
  const map = new Map<Id, ShareDue[]>()
  for (const s of shares) {
    const list = map.get(s.expense_id)
    if (list) list.push(s)
    else map.set(s.expense_id, [s])
  }
  return map
}

/** 每人淨餘額：正數＝別人欠他（應收），負數＝他欠別人（應付） */
export function netBalances(data: BalanceInput): Map<Id, number> {
  const bal = new Map<Id, number>(data.members.map((m) => [m.id, 0]))
  const byExpense = groupShares(data.shares)
  for (const e of data.expenses) applyExpense(bal, e, byExpense.get(e.id) ?? [])
  for (const p of data.payments) applyPayment(bal, p)
  return bal
}

/** 貪婪法：每次讓最大債務人付給最大債權人，得到筆數最少的轉帳建議 */
export function simplifyDebts(balances: Map<Id, number> | Record<Id, number>): Transfer[] {
  // 非有限值（±Infinity、NaN）相減不會歸零，留著會讓下方迴圈停不下來
  const entries = (balances instanceof Map ? [...balances] : Object.entries(balances)).filter(([, v]) =>
    Number.isFinite(v),
  )
  const byAmountDesc = (a: { id: Id; amt: number }, b: { id: Id; amt: number }) =>
    b.amt - a.amt || a.id.localeCompare(b.id)
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }))
  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }))
  const transfers: Transfer[] = []
  while (debtors.length && creditors.length) {
    debtors.sort(byAmountDesc)
    creditors.sort(byAmountDesc)
    const d = debtors[0]
    const c = creditors[0]
    const amount = Math.min(d.amt, c.amt)
    transfers.push({ from: d.id, to: c.id, amount })
    d.amt -= amount
    c.amt -= amount
    if (d.amt === 0) debtors.shift()
    if (c.amt === 0) creditors.shift()
  }
  return transfers
}

/** 以本地時區午夜作為打球日期的時間點，無日期場次用建立時間 */
export function sessionTime(s: Session): number {
  if (s.play_date) {
    const [y, m, d] = s.play_date.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  return Date.parse(s.created_at)
}

export interface PairCoverage {
  member_id: Id
  payer_id: Id
  due: number
  /** 同場直接付給該墊付者的金額 */
  paid: number
  payments: Payment[]
}

export type CoverageInput = Pick<LedgerData, 'expenses' | 'shares' | 'payments'>

/** 某場每位非墊付者對各墊付者的應付與同場直接付款 */
export function sessionCoverage(data: CoverageInput, sessionId: Id): PairCoverage[] {
  const expenses = data.expenses.filter((e) => e.session_id === sessionId)
  const payerOf = new Map(expenses.map((e) => [e.id, e.payer_member_id]))
  const pairs = new Map<string, PairCoverage>()
  for (const s of data.shares) {
    const payer = payerOf.get(s.expense_id)
    if (!payer || payer === s.member_id) continue
    const key = `${s.member_id}|${payer}`
    const pair = pairs.get(key) ?? { member_id: s.member_id, payer_id: payer, due: 0, paid: 0, payments: [] }
    pair.due += s.amount_due
    pairs.set(key, pair)
  }
  for (const p of data.payments) {
    if (p.session_id !== sessionId) continue
    const pair = pairs.get(`${p.from_member_id}|${p.to_member_id}`)
    if (!pair) continue
    pair.paid += p.amount
    pair.payments.push(p)
  }
  return [...pairs.values()]
}

export type SettleReason = 'direct' | 'netted'

/** none＝尚無費用，不算結清也不算未結清 */
export type SessionStatus = SettleReason | 'open' | 'none'

export type StatusInput = Pick<LedgerData, 'members' | 'sessions' | 'expenses' | 'shares' | 'payments'>

/**
 * 個人事後打平：依時間重播所有場次與付款，某人在某場有欠款，之後只要有任一時間點他的淨餘額 ≥ 0（不再欠任何人），
 * 他在該場以及之前場次的欠款都算已打平；回傳各場已打平的欠款者
 */
export function nettedMembers(data: StatusInput): Map<Id, Set<Id>> {
  type Event = { t: number; order: number; session?: Session; payment?: Payment }
  const events: Event[] = [
    ...data.sessions.map((session) => ({ t: sessionTime(session), order: 0, session })),
    ...data.payments.map((payment) => ({ t: Date.parse(payment.paid_at), order: 1, payment })),
  ]
  // 同一時間點先記費用再記付款，避免當天付款被排到場次之前
  events.sort((a, b) => a.t - b.t || a.order - b.order)

  const byExpense = groupShares(data.shares)
  const expensesBySession = new Map<Id, Expense[]>()
  for (const e of data.expenses) expensesBySession.set(e.session_id, [...(expensesBySession.get(e.session_id) ?? []), e])

  const bal = new Map<Id, number>(data.members.map((m) => [m.id, 0]))
  // 每人還沒打平的欠款場次
  const pending = new Map<Id, Id[]>()
  const result = new Map<Id, Set<Id>>()
  for (const ev of events) {
    if (ev.session) {
      for (const e of expensesBySession.get(ev.session.id) ?? []) {
        const shares = byExpense.get(e.id) ?? []
        applyExpense(bal, e, shares)
        for (const s of shares) {
          if (s.member_id === e.payer_member_id || s.amount_due <= 0) continue
          const list = pending.get(s.member_id) ?? []
          if (!list.includes(ev.session.id)) list.push(ev.session.id)
          pending.set(s.member_id, list)
        }
      }
    } else if (ev.payment) {
      applyPayment(bal, ev.payment)
    }
    for (const [memberId, sessionIds] of pending) {
      if ((bal.get(memberId) ?? 0) < 0) continue
      for (const id of sessionIds) result.set(id, (result.get(id) ?? new Set()).add(memberId))
      pending.delete(memberId)
    }
  }
  return result
}

/**
 * 場次結清判定，有費用且符合任一即結清：
 * (1) 每位非墊付者的應付都有足額的同場直接付款
 * (2) 每位非墊付者不是付清就是個人事後打平（見 nettedMembers）；全隊歸零時人人都打平，涵蓋全隊抵銷的情況
 * 回傳已結清場次與原因；沒有費用的場次一律不在 Map 內
 */
export function sessionSettlements(
  data: StatusInput,
  netted: Map<Id, Set<Id>> = nettedMembers(data),
): Map<Id, SettleReason> {
  const result = new Map<Id, SettleReason>()
  const withExpense = new Set(data.expenses.map((e) => e.session_id))

  for (const s of data.sessions) {
    if (!withExpense.has(s.id)) continue
    const pairs = sessionCoverage(data, s.id)
    if (pairs.every((p) => p.paid >= p.due)) result.set(s.id, 'direct')
    else if (pairs.every((p) => p.paid >= p.due || netted.get(s.id)?.has(p.member_id))) result.set(s.id, 'netted')
  }
  return result
}

/** 每個場次的狀態：尚無費用、未結清、已結清（直接付清或抵銷） */
export function sessionStatuses(
  data: StatusInput,
  settlements: Map<Id, SettleReason> = sessionSettlements(data),
): Map<Id, SessionStatus> {
  const withExpense = new Set(data.expenses.map((e) => e.session_id))
  return new Map(
    data.sessions.map((s): [Id, SessionStatus] => [
      s.id,
      withExpense.has(s.id) ? (settlements.get(s.id) ?? 'open') : 'none',
    ]),
  )
}
