import { InvalidTokenError } from './repository'

/** 目標列不在時的處理：update 視為失敗；delete 視為已達成（可能已被別人刪掉） */
export type OnMissing = 'fail' | 'ignore'

export class RowMissingError extends Error {
  constructor() {
    super('這筆資料已不存在，可能已被其他人刪除')
    this.name = 'RowMissingError'
  }
}

/**
 * 檢查 update／delete 實際影響的列數
 * RLS 擋下時 PostgREST 不報錯、只是影響 0 列，所以 0 列時要再問一次 token 是否仍有效，才分得出是連結失效還是資料已不在
 */
export async function verifyAffected(affected: number, onMissing: OnMissing, tokenOk: () => Promise<boolean>) {
  if (affected > 0) return
  if (!(await tokenOk())) throw new InvalidTokenError()
  if (onMissing === 'fail') throw new RowMissingError()
}
