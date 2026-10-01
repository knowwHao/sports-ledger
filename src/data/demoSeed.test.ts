import { describe, expect, it } from 'vitest'
import { createDemoDb } from './demoSeed'
import { summarize } from '@/lib/ledger'

describe('Demo 示範資料', () => {
  const db = createDemoDb(new Date(2026, 9, 1))
  const data = { ...db, team_name: db.settings.team_name, updated_at: db.settings.updated_at }
  const summary = summarize(data)

  it('兩種運動都有場次，成員部分重疊', () => {
    const [p, b] = db.sports
    const attendeesOf = (sportId: string) =>
      new Set(
        db.attendances
          .filter((a) => db.sessions.find((s) => s.id === a.session_id)?.sport_id === sportId)
          .map((a) => a.member_id),
      )
    const pm = attendeesOf(p.id)
    const bm = attendeesOf(b.id)
    expect(db.sessions.filter((s) => s.sport_id === p.id).length).toBeGreaterThan(3)
    expect(db.sessions.filter((s) => s.sport_id === b.id).length).toBeGreaterThan(3)
    expect([...pm].some((id) => bm.has(id))).toBe(true)
    expect([...pm].some((id) => !bm.has(id))).toBe(true)
  })

  it('含年費場次、多位墊付者與部分付款', () => {
    expect(db.sessions.some((s) => s.play_date === null && s.sport_id === null)).toBe(true)
    expect(new Set(db.expenses.map((e) => e.payer_member_id)).size).toBeGreaterThanOrEqual(4)
    expect(db.payments.some((p) => p.note === '先付一半')).toBe(true)
    expect(db.payments.some((p) => p.session_id === null)).toBe(true)
  })

  it('餘額加總為 0，且有結算建議與已結清／未結清場次', () => {
    expect([...summary.balances.values()].reduce((a, b) => a + b, 0)).toBe(0)
    expect(summary.transfers.length).toBeGreaterThan(0)
    expect(summary.settlements.size).toBeGreaterThan(0)
    expect(summary.settlements.size).toBeLessThan(db.sessions.length)
  })
})
