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

type TimelineEvent = { t: number; order: number; session?: Session; payment?: Payment }

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * 場次以 sessionTime、付款以 paid_at 排序；同一時間點先記費用再記付款，避免當天付款被排到場次之前
 * 場次只有日期，當天有儲值時改排在當天最後一筆儲值之後，當天交給保管人的錢才扣得到當天那場
 */
function timeline(sessions: Session[], payments: Payment[]): TimelineEvent[] {
  const lastTopup = new Map<number, number>()
  for (const p of payments) {
    if (p.kind !== 'topup') continue
    const at = Date.parse(p.paid_at)
    const day = startOfDay(at)
    lastTopup.set(day, Math.max(lastTopup.get(day) ?? at, at))
  }
  const events: TimelineEvent[] = [
    ...sessions.map((session) => {
      const t = sessionTime(session)
      return { t: (session.play_date && lastTopup.get(t)) || t, order: 0, session }
    }),
    ...payments.map((payment) => ({ t: Date.parse(payment.paid_at), order: payment.kind === 'topup' ? -1 : 1, payment })),
  ]
  return events.sort((a, b) => a.t - b.t || a.order - b.order)
}

function expensesBySession(expenses: Expense[]): Map<Id, Expense[]> {
  const map = new Map<Id, Expense[]>()
  for (const e of expenses) map.set(e.session_id, [...(map.get(e.session_id) ?? []), e])
  return map
}

const walletKey = (member: Id, holder: Id) => `${member}|${holder}`

/** 有儲值紀錄的（成員, 保管人）配對 */
function walletPairs(payments: Payment[]): Set<string> {
  return new Set(payments.filter((p) => p.kind === 'topup').map((p) => walletKey(p.from_member_id, p.to_member_id)))
}

export interface WalletEntry {
  /** refund＝保管人付給成員的錢 */
  kind: 'topup' | 'payment' | 'refund' | 'session'
  at: number
  sessionId: Id | null
  paymentId: Id | null
  delta: number
  /** 這筆之後的餘額，負數＝儲值不足、差額是欠保管人的錢 */
  balance: number
  /** 場次扣款中由儲值付掉的部分 */
  covered?: number
}

export interface Wallet {
  member: Id
  holder: Id
  balance: number
  /** 依時間由舊到新 */
  entries: WalletEntry[]
}

export type WalletInput = Pick<LedgerData, 'sessions' | 'expenses' | 'shares' | 'payments'>

/**
 * 儲值帳：成員儲值給保管人後，兩人之間所有往來（儲值、一般付款、互相墊付的應付）依時間累計成餘額，
 * 所以儲值前的舊欠款會先抵掉；只算保管人墊付的費用，欠別人的錢不受影響
 */
export function wallets(data: WalletInput): Wallet[] {
  const pairs = walletPairs(data.payments)
  if (!pairs.size) return []
  const map = new Map<string, Wallet>()
  for (const k of pairs) {
    const [member, holder] = k.split('|')
    map.set(k, { member, holder, balance: 0, entries: [] })
  }
  const byExpense = groupShares(data.shares)
  const bySession = expensesBySession(data.expenses)

  for (const ev of timeline(data.sessions, data.payments)) {
    if (ev.session) {
      const deltas = new Map<string, { due: number; credit: number }>()
      const bump = (k: string) => deltas.get(k) ?? deltas.set(k, { due: 0, credit: 0 }).get(k)!
      for (const e of bySession.get(ev.session.id) ?? []) {
        for (const s of byExpense.get(e.id) ?? []) {
          if (s.member_id === e.payer_member_id || s.amount_due <= 0) continue
          if (map.has(walletKey(s.member_id, e.payer_member_id))) bump(walletKey(s.member_id, e.payer_member_id)).due += s.amount_due
          if (map.has(walletKey(e.payer_member_id, s.member_id))) bump(walletKey(e.payer_member_id, s.member_id)).credit += s.amount_due
        }
      }
      for (const [k, d] of deltas) {
        const w = map.get(k)!
        const covered = Math.min(d.due, Math.max(0, w.balance + d.credit))
        w.balance += d.credit - d.due
        w.entries.push({ kind: 'session', at: ev.t, sessionId: ev.session.id, paymentId: null, delta: d.credit - d.due, balance: w.balance, covered })
      }
    } else if (ev.payment) {
      const p = ev.payment
      const entry = { at: ev.t, sessionId: p.session_id, paymentId: p.id }
      const paid = map.get(walletKey(p.from_member_id, p.to_member_id))
      if (paid) {
        paid.balance += p.amount
        paid.entries.push({ ...entry, kind: p.kind === 'topup' ? 'topup' : 'payment', delta: p.amount, balance: paid.balance })
      }
      const back = map.get(walletKey(p.to_member_id, p.from_member_id))
      if (back) {
        back.balance -= p.amount
        back.entries.push({ ...entry, kind: 'refund', delta: -p.amount, balance: back.balance })
      }
    }
  }
  return [...map.values()]
}

/** 各場由儲值付掉的金額，key 為 `場次|成員|保管人` */
export function walletCoverage(list: Wallet[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of list) {
    for (const e of w.entries) if (e.sessionId && e.covered) map.set(`${e.sessionId}|${w.member}|${w.holder}`, e.covered)
  }
  return map
}

/** 把儲值餘額從淨額中拿掉：那是成員放在保管人那裡的錢，不是保管人要退的欠款 */
export function withoutWallets(balances: Map<Id, number>, list: Wallet[]): Map<Id, number> {
  const out = new Map(balances)
  for (const w of list) {
    if (w.balance <= 0) continue
    add(out, w.member, -w.balance)
    add(out, w.holder, w.balance)
  }
  return out
}

export type SettleReason = 'direct' | 'netted'

/** none＝尚無費用，不算結清也不算未結清 */
export type SessionStatus = SettleReason | 'open' | 'none'

export type StatusInput = Pick<LedgerData, 'members' | 'sessions' | 'expenses' | 'shares' | 'payments'>

/**
 * 個人事後打平：依時間重播所有場次與付款，某人在某場有欠款，之後只要有任一時間點他的淨餘額 ≥ 0（不再欠任何人），
 * 他在該場以及之前場次的欠款都算已打平；回傳各場已打平的欠款者
 * 淨餘額不含儲值餘額，否則有儲值的人欠別人的錢會被當成已打平
 */
export function nettedMembers(data: StatusInput): Map<Id, Set<Id>> {
  const byExpense = groupShares(data.shares)
  const bySession = expensesBySession(data.expenses)
  const pairs = walletPairs(data.payments)
  const bal = new Map<Id, number>(data.members.map((m) => [m.id, 0]))
  const pairNet = new Map<string, number>()
  const movePair = (member: Id, holder: Id, delta: number) => {
    const k = walletKey(member, holder)
    if (pairs.has(k)) pairNet.set(k, (pairNet.get(k) ?? 0) + delta)
  }
  const adjusted = (id: Id) => {
    let v = bal.get(id) ?? 0
    for (const [k, net] of pairNet) {
      if (net <= 0) continue
      const [member, holder] = k.split('|')
      if (member === id) v -= net
      else if (holder === id) v += net
    }
    return v
  }

  // 每人還沒打平的欠款場次
  const pending = new Map<Id, Id[]>()
  const result = new Map<Id, Set<Id>>()
  for (const ev of timeline(data.sessions, data.payments)) {
    if (ev.session) {
      for (const e of bySession.get(ev.session.id) ?? []) {
        const shares = byExpense.get(e.id) ?? []
        applyExpense(bal, e, shares)
        for (const s of shares) {
          if (s.member_id === e.payer_member_id || s.amount_due <= 0) continue
          movePair(s.member_id, e.payer_member_id, -s.amount_due)
          movePair(e.payer_member_id, s.member_id, s.amount_due)
          const list = pending.get(s.member_id) ?? []
          if (!list.includes(ev.session.id)) list.push(ev.session.id)
          pending.set(s.member_id, list)
        }
      }
    } else if (ev.payment) {
      const p = ev.payment
      applyPayment(bal, p)
      movePair(p.from_member_id, p.to_member_id, p.amount)
      movePair(p.to_member_id, p.from_member_id, -p.amount)
    }
    for (const [memberId, sessionIds] of pending) {
      if (adjusted(memberId) < 0) continue
      for (const id of sessionIds) result.set(id, (result.get(id) ?? new Set()).add(memberId))
      pending.delete(memberId)
    }
  }
  return result
}

/**
 * 場次結清判定，有費用且符合任一即結清：
 * (1) 每位非墊付者的應付都有足額的同場直接付款或儲值扣款
 * (2) 每位非墊付者不是付清就是個人事後打平（見 nettedMembers）；全隊歸零時人人都打平，涵蓋全隊抵銷的情況
 * 回傳已結清場次與原因；沒有費用的場次一律不在 Map 內
 */
export function sessionSettlements(
  data: StatusInput,
  netted: Map<Id, Set<Id>> = nettedMembers(data),
  covered: Map<string, number> = walletCoverage(wallets(data)),
): Map<Id, SettleReason> {
  const result = new Map<Id, SettleReason>()
  const withExpense = new Set(data.expenses.map((e) => e.session_id))

  for (const s of data.sessions) {
    if (!withExpense.has(s.id)) continue
    const pairs = sessionCoverage(data, s.id)
    const paid = (p: PairCoverage) => p.paid + (covered.get(`${s.id}|${p.member_id}|${p.payer_id}`) ?? 0) >= p.due
    if (pairs.every(paid)) result.set(s.id, 'direct')
    else if (pairs.every((p) => paid(p) || netted.get(s.id)?.has(p.member_id))) result.set(s.id, 'netted')
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
