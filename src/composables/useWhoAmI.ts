import { computed, ref, watch } from 'vue'
import { repo } from '@/data'
import type { Id, MemberSession, PinResult } from '@/types'
import { PIN_LOCK_MINUTES } from '@/lib/pin'

const KEY = 'pbl-member-session'
// 加入密碼前只記成員 id、沒有憑證，舊值直接丟掉，要重新輸入密碼
const LEGACY_KEY = 'pbl-whoami'

function read(): MemberSession | null {
  try {
    localStorage.removeItem(LEGACY_KEY)
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.memberId === 'string' && typeof v.key === 'string' ? v : null
  } catch {
    return null
  }
}

const session = ref<MemberSession | null>(read())
watch(session, (v) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v))
    else localStorage.removeItem(KEY)
  } catch {
    // 記不住就每次重新輸入密碼
  }
})

const me = computed(() => session.value?.memberId ?? null)

/** 目前登入的成員 id；要切換成員請用 askLogin，不能直接指定 */
export function useWhoAmI() {
  return me
}

export function currentSession(): MemberSession | null {
  return session.value
}

export function logout() {
  session.value = null
}

export async function login(memberId: Id, pin: string): Promise<PinResult> {
  const r = await repo.loginMember(memberId, pin)
  if (r.ok) session.value = { memberId, key: r.key }
  return r
}

export async function changePin(oldPin: string, newPin: string): Promise<PinResult> {
  const s = session.value
  if (!s) throw new Error('請先選擇自己並輸入密碼')
  const r = await repo.changeMemberPin(s.memberId, oldPin, newPin)
  if (r.ok) session.value = { memberId: s.memberId, key: r.key }
  return r
}

/** PinLoginHost 顯示中的登入請求 */
export const pendingLogin = ref<{ memberId: Id; resolve: (ok: boolean) => void } | null>(null)

/** 跳出密碼輸入框，登入成功回傳 true，取消回傳 false */
export function askLogin(memberId: Id): Promise<boolean> {
  pendingLogin.value?.resolve(false)
  return new Promise((resolve) => {
    pendingLogin.value = { memberId, resolve }
  })
}

/** 錯誤或鎖定時給使用者看的說明 */
export function pinFailureText(r: Extract<PinResult, { ok: false }>): string {
  if (r.lockedUntil) {
    const t = new Date(r.lockedUntil)
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    return `錯太多次了，請在 ${hhmm} 之後再試`
  }
  return r.remaining ? `密碼錯誤，再錯 ${r.remaining} 次會鎖定 ${PIN_LOCK_MINUTES} 分鐘` : '密碼錯誤'
}
