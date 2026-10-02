import { describe, expect, it } from 'vitest'
import type { Expense, ExpenseShare, Member, Payment, Session } from '@/types'
import {
  computeDues,
  netBalances,
  nettedMembers,
  sessionCoverage,
  sessionSettlements,
  sessionStatuses,
  simplifyDebts,
  walletCoverage,
  wallets,
  withoutWallets,
  type StatusInput,
} from './balance'

const member = (id: string): Member => ({ id, name: id, color: '#000', active: true, sort_order: 0, created_at: '' })
const session = (id: string, play_date: string): Session => ({
  id,
  sport_id: null,
  play_date,
  title: null,
  location: null,
  note: '',
  locked: false,
  created_at: `${play_date}T12:00:00.000Z`,
})
let seq = 0
const pay = (from: string, to: string, amount: number, paid_at: string, session_id: string | null = null): Payment => ({
  id: `p${++seq}`,
  from_member_id: from,
  to_member_id: to,
  amount,
  paid_at,
  session_id,
  note: '',
  kind: 'payment',
  created_at: paid_at,
})
const topup = (from: string, to: string, amount: number, paid_at: string): Payment => ({ ...pay(from, to, amount, paid_at), kind: 'topup' })

/** 建一筆費用並平均分攤 */
function expense(id: string, sessionId: string, amount: number, payer: string, participants: string[]) {
  const e: Expense = { id, session_id: sessionId, label: id, amount, payer_member_id: payer, created_at: '' }
  const shares: ExpenseShare[] = computeDues(amount, participants).shares.map((s) => ({ ...s, expense_id: id }))
  return { e, shares }
}

function ledger(
  members: string[],
  sessions: Session[],
  items: ReturnType<typeof expense>[],
  payments: Payment[] = [],
): StatusInput {
  return {
    members: members.map(member),
    sessions,
    expenses: items.map((i) => i.e),
    shares: items.flatMap((i) => i.shares),
    payments,
  }
}

const sumPositive = (m: Map<string, number>) => [...m.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0)

describe('computeDues', () => {
  it('整除時每人應付相同且沒有零頭', () => {
    const r = computeDues(1200, ['a', 'b', 'c', 'd'])
    expect(r.perHead).toBe(300)
    expect(r.surplus).toBe(0)
  })

  it('無法整除時無條件進位，零頭算墊付者多收', () => {
    const r = computeDues(1000, ['a', 'b', 'c'])
    expect(r.perHead).toBe(334)
    expect(r.surplus).toBe(2)
  })

  it('帶朋友的人多付朋友那幾份，朋友和成員一樣平分', () => {
    const r = computeDues(1000, ['a', 'b', 'c'], new Map([['a', 2]]))
    expect(r.perHead).toBe(250)
    expect(r.shares).toEqual([
      { member_id: 'a', amount_due: 500 },
      { member_id: 'b', amount_due: 250 },
      { member_id: 'c', amount_due: 250 },
    ])
    expect(r.surplus).toBe(0)
  })

  it('帶朋友時以總份數進位，零頭仍由墊付者多收', () => {
    const r = computeDues(1000, ['a', 'b'], new Map([['b', 2]]))
    expect(r.perHead).toBe(334)
    expect(r.shares.map((s) => s.amount_due)).toEqual([334, 668])
    expect(r.surplus).toBe(2)
  })

  it('本人沒來只帶朋友時只付朋友那份，0 份的人不列入分攤', () => {
    const r = computeDues(900, ['a', 'b', 'c'], new Map([['b', 1], ['c', 0]]))
    expect(r.perHead).toBe(450)
    expect(r.shares).toEqual([
      { member_id: 'a', amount_due: 450 },
      { member_id: 'b', amount_due: 450 },
    ])
  })

  it('帶朋友的分攤在淨額與結清判定上和一般分攤一樣', () => {
    const e: Expense = { id: 'e1', session_id: 's1', label: 'e1', amount: 1200, payer_member_id: 'a', created_at: '' }
    const shares = computeDues(1200, ['a', 'b', 'c'], new Map([['b', 2]])).shares.map((s) => ({ ...s, expense_id: 'e1' }))
    const data: StatusInput = {
      members: ['a', 'b', 'c'].map(member),
      sessions: [session('s1', '2026-09-01')],
      expenses: [e],
      shares,
      payments: [pay('b', 'a', 600, '2026-09-02T00:00:00.000Z', 's1')],
    }
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 300, b: 0, c: -300 })
    expect(sessionCoverage(data, 's1').find((p) => p.member_id === 'b')).toMatchObject({ due: 600, paid: 600 })
  })
})

describe('netBalances', () => {
  it('墊付者自己那份應付自然抵掉', () => {
    const data = ledger(['a', 'b', 'c'], [session('s1', '2026-09-01')], [expense('e1', 's1', 900, 'a', ['a', 'b', 'c'])])
    const bal = netBalances(data)
    expect(Object.fromEntries(bal)).toEqual({ a: 600, b: -300, c: -300 })
  })

  it('有零頭時墊付者收分攤總額，全隊加總仍為 0', () => {
    const data = ledger(['a', 'b', 'c'], [session('s1', '2026-09-01')], [expense('e1', 's1', 1000, 'a', ['a', 'b', 'c'])])
    const bal = netBalances(data)
    expect(bal.get('a')).toBe(668)
    expect([...bal.values()].reduce((x, y) => x + y, 0)).toBe(0)
  })

  it('部分付款只扣掉已付的部分', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 600, 'a', ['a', 'b'])],
      [pay('b', 'a', 100, '2026-09-02T00:00:00.000Z', 's1')],
    )
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 200, b: -200 })
    expect(sessionSettlements(data).has('s1')).toBe(false)
  })

  it('改分攤對象後重算應付，已付紀錄保留並重新計算是否足額', () => {
    const s1 = session('s1', '2026-09-01')
    const payments = [pay('b', 'a', 300, '2026-09-02T00:00:00.000Z', 's1')]
    const before = ledger(['a', 'b', 'c', 'd'], [s1], [expense('e1', 's1', 900, 'a', ['a', 'b', 'c'])], payments)
    expect(sessionCoverage(before, 's1').find((p) => p.member_id === 'b')).toMatchObject({ due: 300, paid: 300 })

    const after = ledger(['a', 'b', 'c', 'd'], [s1], [expense('e1', 's1', 900, 'a', ['a', 'b', 'c', 'd'])], payments)
    const b = sessionCoverage(after, 's1').find((p) => p.member_id === 'b')
    expect(b).toMatchObject({ due: 225, paid: 300 })
    expect(netBalances(after).get('b')).toBe(75)
  })

  it('墊付者沒出席時只有墊付入帳，出席者都欠他', () => {
    const data = ledger(
      ['a', 'b', 'c', 'd'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 900, 'd', ['a', 'b', 'c'])],
      [pay('a', 'd', 300, '2026-09-02T00:00:00.000Z', 's1'), pay('b', 'd', 300, '2026-09-02T00:00:00.000Z', 's1')],
    )
    expect(Object.fromEntries(netBalances(data))).toEqual({ a: 0, b: 0, c: -300, d: 300 })
    expect(sessionCoverage(data, 's1').map((p) => [p.member_id, p.payer_id, p.due])).toEqual([
      ['a', 'd', 300],
      ['b', 'd', 300],
      ['c', 'd', 300],
    ])
    expect(sessionSettlements(data).has('s1')).toBe(false)
    const paid = { ...data, payments: [...data.payments, pay('c', 'd', 300, '2026-09-03T00:00:00.000Z', 's1')] }
    expect(sessionSettlements(paid).get('s1')).toBe('direct')
  })
})

describe('simplifyDebts', () => {
  it('鏈狀 A→B→C 簡化成 A→C', () => {
    const data = ledger(
      ['A', 'B', 'C'],
      [session('s1', '2026-09-01'), session('s2', '2026-09-02')],
      [expense('e1', 's1', 200, 'B', ['A', 'B']), expense('e2', 's2', 200, 'C', ['B', 'C'])],
    )
    expect(simplifyDebts(netBalances(data))).toEqual([{ from: 'A', to: 'C', amount: 100 }])
  })

  it('全部為 0 時沒有建議', () => {
    expect(simplifyDebts({ a: 0, b: 0, c: 0 })).toEqual([])
  })

  it('忽略 ±Infinity 與 NaN，不會卡在無窮迴圈', () => {
    const bal = { a: Infinity, b: -Infinity, c: NaN, d: 100, e: -100 }
    expect(simplifyDebts(bal)).toEqual([{ from: 'e', to: 'd', amount: 100 }])
    expect(simplifyDebts({ a: Infinity, b: -Infinity })).toEqual([])
  })

  it('建議轉帳總和等於正餘額總和', () => {
    const bal = new Map([
      ['a', 450],
      ['b', -120],
      ['c', -330],
      ['d', 200],
      ['e', -200],
    ])
    const transfers = simplifyDebts(bal)
    expect(transfers.reduce((s, t) => s + t.amount, 0)).toBe(sumPositive(bal))
    expect(transfers.length).toBeLessThanOrEqual(4)
    const after = new Map(bal)
    for (const t of transfers) {
      after.set(t.from, after.get(t.from)! + t.amount)
      after.set(t.to, after.get(t.to)! - t.amount)
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true)
  })
})

describe('sessionSettlements', () => {
  it('每位非墊付者都有足額同場直接付款 → 已結清', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 900, 'a', ['a', 'b', 'c'])],
      [pay('b', 'a', 300, '2026-09-02T00:00:00.000Z', 's1'), pay('c', 'a', 300, '2026-09-03T00:00:00.000Z', 's1')],
    )
    expect(sessionSettlements(data).get('s1')).toBe('direct')
  })

  it('之後出現全員餘額為 0 的時間點 → 之前的場次都算結清', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-01'), session('s2', '2026-09-08'), session('s3', '2026-09-15')],
      [
        expense('e1', 's1', 600, 'a', ['a', 'b']),
        expense('e2', 's2', 600, 'b', ['a', 'b']),
        expense('e3', 's3', 600, 'a', ['a', 'b']),
      ],
    )
    const st = sessionSettlements(data)
    expect(st.get('s1')).toBe('netted')
    expect(st.get('s2')).toBe('netted')
    expect(st.has('s3')).toBe(false)
  })

  it('非同場的轉帳讓全員歸零，也算結清', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 900, 'a', ['a', 'b', 'c'])],
      [pay('b', 'a', 300, '2026-09-05T00:00:00.000Z'), pay('c', 'a', 300, '2026-09-06T00:00:00.000Z')],
    )
    expect(sessionSettlements(data).get('s1')).toBe('netted')
  })

  it('沒有付款也沒有抵銷 → 未結清', () => {
    const data = ledger(['a', 'b'], [session('s1', '2026-09-01')], [expense('e1', 's1', 600, 'a', ['a', 'b'])])
    expect(sessionSettlements(data).has('s1')).toBe(false)
  })

  it('每位欠款者都已直接付清或個人打平 → 已打平，即使全隊還沒歸零', () => {
    const data = ledger(
      ['a', 'b', 'c', 'd'],
      [session('s1', '2026-09-01'), session('s2', '2026-09-08')],
      [expense('e1', 's1', 600, 'a', ['a', 'b']), expense('e2', 's2', 600, 'c', ['c', 'd'])],
      [pay('b', 'a', 300, '2026-09-10T00:00:00.000Z')],
    )
    const st = sessionSettlements(data)
    expect(st.get('s1')).toBe('netted')
    expect(st.has('s2')).toBe(false)
  })

  it('有人直接付清、有人個人打平 → 已打平', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 900, 'a', ['a', 'b', 'c'])],
      [pay('b', 'a', 300, '2026-09-02T00:00:00.000Z', 's1'), pay('c', 'a', 300, '2026-09-05T00:00:00.000Z')],
    )
    expect(sessionSettlements(data).get('s1')).toBe('netted')
  })
})

describe('nettedMembers', () => {
  it('用轉帳還清自己的欠款 → 他在之前的場次算已打平，還沒付的人不算', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 900, 'a', ['a', 'b', 'c'])],
      [pay('b', 'a', 300, '2026-09-05T00:00:00.000Z')],
    )
    expect([...(nettedMembers(data).get('s1') ?? [])]).toEqual(['b'])
    expect(sessionSettlements(data).has('s1')).toBe(false)
  })

  it('打平之後又欠新的錢，舊場次維持已打平，新場次不算', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-01'), session('s2', '2026-09-15')],
      [expense('e1', 's1', 600, 'a', ['a', 'b']), expense('e2', 's2', 600, 'a', ['a', 'b'])],
      [pay('b', 'a', 300, '2026-09-05T00:00:00.000Z')],
    )
    const netted = nettedMembers(data)
    expect(netted.get('s1')?.has('b')).toBe(true)
    expect(netted.get('s2')?.has('b') ?? false).toBe(false)
    const st = sessionSettlements(data)
    expect(st.get('s1')).toBe('netted')
    expect(st.has('s2')).toBe(false)
  })

  it('別人欠他的錢足以抵掉這場的應付 → 這場一記就算打平', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s0', '2026-08-25'), session('s1', '2026-09-01')],
      [expense('e0', 's0', 600, 'b', ['b', 'c']), expense('e1', 's1', 600, 'a', ['a', 'b'])],
    )
    expect(nettedMembers(data).get('s1')?.has('b')).toBe(true)
    expect(nettedMembers(data).get('s0')?.has('c') ?? false).toBe(false)
  })

  it('只付了一部分、還欠錢 → 不算打平', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 600, 'a', ['a', 'b'])],
      [pay('b', 'a', 200, '2026-09-05T00:00:00.000Z')],
    )
    expect(nettedMembers(data).get('s1')?.has('b') ?? false).toBe(false)
  })
})

describe('沒有費用的場次', () => {
  const data = ledger(
    ['a', 'b'],
    [session('s0', '2026-08-25'), session('s1', '2026-09-01'), session('s2', '2026-09-08')],
    [expense('e1', 's1', 600, 'a', ['a', 'b'])],
    [pay('b', 'a', 300, '2026-09-02T00:00:00.000Z', 's1')],
  )

  it('不算已結清（直接付清或抵銷都不算）', () => {
    const st = sessionSettlements(data)
    expect(st.get('s1')).toBe('direct')
    expect(st.has('s0')).toBe(false)
    expect(st.has('s2')).toBe(false)
  })

  it('狀態為 none，有費用的場次照常判定', () => {
    const statuses = sessionStatuses(data)
    expect(statuses.get('s0')).toBe('none')
    expect(statuses.get('s2')).toBe('none')
    expect(statuses.get('s1')).toBe('direct')
  })

  it('有費用但未付清的場次為 open', () => {
    const open = ledger(['a', 'b'], [session('s1', '2026-09-01')], [expense('e1', 's1', 600, 'a', ['a', 'b'])])
    expect(sessionStatuses(open).get('s1')).toBe('open')
  })
})

describe('儲值金', () => {
  const T = (d: string) => `${d}T12:00:00.000Z`

  it('儲值後每場自動扣款，剩下的錢不會變成保管人要退的轉帳', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-03'), session('s2', '2026-09-10')],
      [expense('e1', 's1', 600, 'a', ['a', 'b']), expense('e2', 's2', 600, 'a', ['a', 'b'])],
      [topup('b', 'a', 3000, T('2026-09-01'))],
    )
    const [w] = wallets(data)
    expect(w).toMatchObject({ member: 'b', holder: 'a', balance: 2400 })
    expect(w.entries.map((e) => [e.kind, e.delta, e.balance])).toEqual([
      ['topup', 3000, 3000],
      ['session', -300, 2700],
      ['session', -300, 2400],
    ])
    const bal = withoutWallets(netBalances(data), wallets(data))
    expect(Object.fromEntries(bal)).toEqual({ a: 0, b: 0 })
    expect(simplifyDebts(bal)).toEqual([])
    const st = sessionSettlements(data)
    expect(st.get('s1')).toBe('direct')
    expect(st.get('s2')).toBe('direct')
  })

  it('儲值不足時餘額停在 0，不足的部分變成欠保管人的錢', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-03'), session('s2', '2026-09-10')],
      [expense('e1', 's1', 600, 'a', ['a', 'b']), expense('e2', 's2', 800, 'a', ['a', 'b'])],
      [topup('b', 'a', 300, T('2026-09-01'))],
    )
    const [w] = wallets(data)
    expect(w.balance).toBe(-400)
    expect(w.entries.map((e) => e.covered)).toEqual([undefined, 300, 0])
    const bal = withoutWallets(netBalances(data), wallets(data))
    expect(simplifyDebts(bal)).toEqual([{ from: 'b', to: 'a', amount: 400 }])
    const st = sessionSettlements(data)
    expect(st.get('s1')).toBe('direct')
    expect(st.has('s2')).toBe(false)
  })

  it('只扣得到一部分時，扣得到的那部分算已付', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-03')],
      [expense('e1', 's1', 1000, 'a', ['a', 'b'])],
      [topup('b', 'a', 200, T('2026-09-01'))],
    )
    expect(walletCoverage(wallets(data)).get('s1|b|a')).toBe(200)
    expect(sessionSettlements(data).has('s1')).toBe(false)
    const paid = { ...data, payments: [...data.payments, pay('b', 'a', 300, T('2026-09-04'), 's1')] }
    expect(sessionSettlements(paid).get('s1')).toBe('direct')
  })

  it('儲值前就欠保管人的錢，儲值時先抵掉', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-09-01')],
      [expense('e1', 's1', 600, 'a', ['a', 'b'])],
      [topup('b', 'a', 1000, T('2026-09-05'))],
    )
    const [w] = wallets(data)
    expect(w.entries.map((e) => [e.kind, e.balance])).toEqual([
      ['session', -300],
      ['topup', 700],
    ])
    expect(w.balance).toBe(700)
    expect(sessionSettlements(data).get('s1')).toBe('netted')
  })

  it('儲值只抵保管人墊付的費用，欠別人的錢照樣要轉', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s1', '2026-09-03')],
      [expense('e1', 's1', 600, 'c', ['b', 'c'])],
      [topup('b', 'a', 2000, T('2026-09-01'))],
    )
    const bal = withoutWallets(netBalances(data), wallets(data))
    expect(Object.fromEntries(bal)).toEqual({ a: 0, b: -300, c: 300 })
    expect(simplifyDebts(bal)).toEqual([{ from: 'b', to: 'c', amount: 300 }])
    expect(sessionSettlements(data).has('s1')).toBe(false)
  })

  it('儲值給兩位保管人時各自計算，不會互相抵用', () => {
    const data = ledger(
      ['a', 'b', 'c'],
      [session('s1', '2026-09-03'), session('s2', '2026-09-04')],
      [expense('e1', 's1', 600, 'a', ['a', 'b']), expense('e2', 's2', 1200, 'c', ['b', 'c'])],
      [topup('b', 'a', 1000, T('2026-09-01')), topup('b', 'c', 500, T('2026-09-01'))],
    )
    const byHolder = Object.fromEntries(wallets(data).map((w) => [w.holder, w.balance]))
    expect(byHolder).toEqual({ a: 700, c: -100 })
    const bal = withoutWallets(netBalances(data), wallets(data))
    expect(simplifyDebts(bal)).toEqual([{ from: 'b', to: 'c', amount: 100 }])
  })

  // 場次只有日期，當天才儲值的錢也要能扣當天那場
  const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

  it('同一天打球又儲值時，當天那場從儲值扣', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s1', '2026-10-02')],
      [expense('e1', 's1', 200, 'a', ['a', 'b'])],
      [topup('b', 'a', 500, local(2026, 10, 2, 13, 57))],
    )
    const [w] = wallets(data)
    expect(w.entries.map((e) => [e.kind, e.delta, e.balance, e.covered])).toEqual([
      ['topup', 500, 500, undefined],
      ['session', -100, 400, 100],
    ])
    expect(sessionSettlements(data).get('s1')).toBe('direct')
  })

  it('同一天凌晨的一般轉帳仍依實際時間排在儲值之前', () => {
    const data = ledger(
      ['a', 'b'],
      [session('s0', '2026-09-30'), session('s1', '2026-10-02')],
      [expense('e0', 's0', 904, 'a', ['a', 'b']), expense('e1', 's1', 200, 'a', ['a', 'b'])],
      [pay('b', 'a', 452, local(2026, 10, 2, 0, 18)), topup('b', 'a', 500, local(2026, 10, 2, 13, 57))],
    )
    const [w] = wallets(data)
    expect(w.entries.map((e) => [e.kind, e.balance])).toEqual([
      ['session', -452],
      ['payment', 0],
      ['topup', 500],
      ['session', 400],
    ])
  })

  it('沒有儲值紀錄時不產生儲值帳，一般預付照舊算要收', () => {
    const data = ledger(['a', 'b'], [], [], [pay('b', 'a', 500, T('2026-09-01'))])
    expect(wallets(data)).toEqual([])
    expect(Object.fromEntries(withoutWallets(netBalances(data), []))).toEqual({ a: -500, b: 500 })
  })
})
