import { describe, expect, it } from 'vitest'
import { guestLabel, partyHeads } from './ledger'

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
