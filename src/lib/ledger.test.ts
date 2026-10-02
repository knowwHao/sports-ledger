import { describe, expect, it } from 'vitest'
import { guestLabel, partyHeads, walletHistory } from './ledger'
import type { Wallet, WalletEntry } from './balance'

describe('partyHeads', () => {
  it('出席算 1 份，帶的朋友各加 1 份，只帶朋友沒出席的人也列入', () => {
    const heads = partyHeads(['a', 'b'], [
      { member_id: 'a', guests: 2, names: '' },
      { member_id: 'c', guests: 1, names: '阿凱' },
    ])
    expect(Object.fromEntries(heads)).toEqual({ a: 3, b: 1, c: 1 })
  })
})

describe('guestLabel', () => {
  it('有名字時顯示名字，多位時補人數；沒出席時註明', () => {
    expect(guestLabel({ member_id: 'a', guests: 1, names: '阿凱' }, true)).toBe('含朋友 阿凱')
    expect(guestLabel({ member_id: 'a', guests: 2, names: '阿凱、小李' }, true)).toBe('含朋友 阿凱、小李（2 位）')
    expect(guestLabel({ member_id: 'a', guests: 2, names: ' ' }, false)).toBe('本人沒來，朋友 2 位')
  })
})

describe('walletHistory', () => {
  const entry = (kind: WalletEntry['kind'], delta: number, balance: number): WalletEntry => ({
    kind,
    at: 0,
    sessionId: null,
    paymentId: null,
    delta,
    balance,
  })
  const wallet = (entries: WalletEntry[]): Wallet => ({ member: 'b', holder: 'a', balance: entries.at(-1)!.balance, entries })

  it('儲值前已經結清時，只從第一筆儲值開始列', () => {
    const h = walletHistory(
      wallet([
        entry('session', -75, -75),
        entry('session', -452, -527),
        entry('payment', 75, -452),
        entry('payment', 452, 0),
        entry('topup', 498, 498),
      ]),
    )
    expect(h.opening).toBe(0)
    expect(h.entries.map((e) => e.kind)).toEqual(['topup'])
  })

  it('儲值前還欠保管人的錢，合併成期初欠款', () => {
    const h = walletHistory(wallet([entry('session', -300, -300), entry('topup', 1000, 700), entry('session', -200, 500)]))
    expect(h.opening).toBe(-300)
    expect(h.entries.map((e) => e.kind)).toEqual(['topup', 'session'])
  })

  it('第一筆就是儲值時沒有期初', () => {
    const h = walletHistory(wallet([entry('topup', 500, 500), entry('session', -100, 400)]))
    expect(h).toMatchObject({ opening: 0 })
    expect(h.entries).toHaveLength(2)
  })
})
