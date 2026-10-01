import { describe, expect, it, vi } from 'vitest'
import { InvalidTokenError } from './repository'
import { RowMissingError, verifyAffected } from './writeCheck'

describe('verifyAffected：update／delete 影響列數判定', () => {
  it('有影響到列就通過，不另外確認 token', async () => {
    const tokenOk = vi.fn(async () => false)
    await expect(verifyAffected(1, 'fail', tokenOk)).resolves.toBeUndefined()
    await expect(verifyAffected(3, 'ignore', tokenOk)).resolves.toBeUndefined()
    expect(tokenOk).not.toHaveBeenCalled()
  })

  it('0 列且 token 已失效：不論哪種呼叫點都丟 InvalidTokenError', async () => {
    const tokenOk = vi.fn(async () => false)
    await expect(verifyAffected(0, 'fail', tokenOk)).rejects.toBeInstanceOf(InvalidTokenError)
    await expect(verifyAffected(0, 'ignore', tokenOk)).rejects.toBeInstanceOf(InvalidTokenError)
    expect(tokenOk).toHaveBeenCalledTimes(2)
  })

  it('0 列但 token 仍有效：update 視為資料已不在', async () => {
    await expect(verifyAffected(0, 'fail', async () => true)).rejects.toBeInstanceOf(RowMissingError)
  })

  it('0 列但 token 仍有效：delete 視為已達成', async () => {
    await expect(verifyAffected(0, 'ignore', async () => true)).resolves.toBeUndefined()
  })

  it('確認 token 的請求本身失敗時把錯誤往外丟，不誤判成失效', async () => {
    const boom = new Error('network')
    await expect(
      verifyAffected(0, 'ignore', async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
  })
})
