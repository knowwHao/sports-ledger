/** 與 schema.sql 的檢查一致：4～8 位數字 */
export const PIN_RE = /^[0-9]{4,8}$/

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin)
}

/** 連續輸錯的上限，超過就鎖定 */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MINUTES = 15
