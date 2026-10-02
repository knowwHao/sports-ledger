import { beforeEach, describe, expect, it } from 'vitest'
import { DemoRepo } from './demoRepo'
import { InvalidTokenError, MemberSessionError, NotPayeeError } from './repository'
import type { MemberSession } from '@/types'

let repo: DemoRepo

async function loginAs(name: string, pin = '0000'): Promise<MemberSession> {
  const m = (await repo.loadLedger()).members.find((x) => x.name === name)!
  const r = await repo.loginMember(m.id, pin)
  if (!r.ok) throw new Error(`login failed: ${JSON.stringify(r)}`)
  return { memberId: m.id, key: r.key }
}

const idOf = async (name: string) => (await repo.loadLedger()).members.find((x) => x.name === name)!.id
const payment = (from: string) => ({
  from_member_id: from,
  amount: 100,
  paid_at: new Date().toISOString(),
  session_id: null as string | null,
  note: '',
  kind: 'payment' as const,
})

beforeEach(() => {
  repo = new DemoRepo()
  repo.reset()
  repo.setTeamToken(repo.teamToken)
})

describe('成員密碼（Demo 模擬 schema.sql）', () => {
  it('示範成員預設 0000，錯誤時回傳剩餘次數', async () => {
    const id = await idOf('孟穎')
    expect((await repo.loginMember(id, '1234')).ok).toBe(false)
    expect(await repo.loginMember(id, '1234')).toEqual({ ok: false, remaining: 3 })
    expect((await repo.loginMember(id, '0000')).ok).toBe(true)
  })

  it('連錯 5 次鎖定，鎖定期間正確密碼也不行', async () => {
    const id = await idOf('志豪')
    for (let i = 0; i < 4; i++) await repo.loginMember(id, '9999')
    const locked = await repo.loginMember(id, '9999')
    expect(locked.ok).toBe(false)
    expect(locked.ok === false && locked.lockedUntil).toBeTruthy()
    expect((await repo.loginMember(id, '0000')).ok).toBe(false)
  })

  it('改密碼後舊憑證與舊密碼都失效', async () => {
    const auth = await loginAs('佳蓉')
    const r = await repo.changeMemberPin(auth.memberId, '0000', '2468')
    expect(r.ok).toBe(true)
    await expect(repo.createPayment(auth, payment(await idOf('孟穎')))).rejects.toBeInstanceOf(MemberSessionError)
    expect((await repo.loginMember(auth.memberId, '0000')).ok).toBe(false)
    expect((await repo.loginMember(auth.memberId, '2468')).ok).toBe(true)
  })

  it('新密碼格式不對、舊密碼錯誤都不能改', async () => {
    const id = await idOf('冠廷')
    await expect(repo.changeMemberPin(id, '0000', '12')).rejects.toThrow()
    expect((await repo.changeMemberPin(id, '1111', '2468')).ok).toBe(false)
    expect((await repo.loginMember(id, '0000')).ok).toBe(true)
  })

  it('新增成員要設定密碼並用它登入', async () => {
    await expect(repo.createMembers([{ name: '新人', color: '#000000', sort_order: 99 }], 'abc')).rejects.toThrow()
    await repo.createMembers([{ name: '新人', color: '#000000', sort_order: 99 }], '5678')
    expect((await repo.loginMember(await idOf('新人'), '5678')).ok).toBe(true)
  })

  it('球隊 token 不對時不能登入', async () => {
    const id = await idOf('孟穎')
    repo.setTeamToken('wrong')
    await expect(repo.loginMember(id, '0000')).rejects.toBeInstanceOf(InvalidTokenError)
  })
})

describe('只有收款人能記錄與刪除付款', () => {
  it('收款人一律是登入者本人', async () => {
    const auth = await loginAs('孟穎')
    const from = await idOf('志豪')
    await repo.createPayment(auth, payment(from))
    const last = (await repo.loadLedger()).payments.at(-1)!
    expect(last.to_member_id).toBe(auth.memberId)
    expect(last.from_member_id).toBe(from)
  })

  it('憑證錯誤或冒用別人的憑證都會被拒', async () => {
    const auth = await loginAs('孟穎')
    const other = await idOf('志豪')
    await expect(repo.createPayment({ memberId: other, key: auth.key }, payment(auth.memberId))).rejects.toBeInstanceOf(
      MemberSessionError,
    )
  })

  it('不能刪不是收給自己的付款', async () => {
    const payee = await loginAs('孟穎')
    await repo.createPayment(payee, payment(await idOf('志豪')))
    const id = (await repo.loadLedger()).payments.at(-1)!.id
    const someone = await loginAs('佳蓉')
    await expect(repo.deletePayments(someone, [id])).rejects.toBeInstanceOf(NotPayeeError)
    await repo.deletePayments(payee, [id])
    expect((await repo.loadLedger()).payments.some((p) => p.id === id)).toBe(false)
  })
})

describe('儲值', () => {
  it('由保管人記錄，不能指定場次', async () => {
    const holder = await loginAs('怡君')
    const from = await idOf('冠廷')
    const sessionId = (await repo.loadLedger()).sessions[0].id
    await expect(repo.createPayment(holder, { ...payment(from), kind: 'topup', session_id: sessionId })).rejects.toThrow()
    await repo.createPayment(holder, { ...payment(from), kind: 'topup' })
    expect((await repo.loadLedger()).payments.at(-1)).toMatchObject({ kind: 'topup', from_member_id: from, to_member_id: holder.memberId })
  })
})
