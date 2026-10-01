import { describe, expect, it } from 'vitest'
import type { Expense, ExpenseShare, Member, Payment, Session } from '@/types'
import {
  computeDues,
  netBalances,
  sessionCoverage,
  sessionSettlements,
  sessionStatuses,
  simplifyDebts,
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
  created_at: paid_at,
})

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
