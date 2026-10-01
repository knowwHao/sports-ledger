import { defineStore } from 'pinia'
import { ref } from 'vue'
import { repo } from '@/data'
import { InvalidTokenError } from '@/data/repository'
import { errorMessage } from '@/composables/useToast'
import { useLedgerStore } from './ledger'

const KEY = 'pbl-team-token'
// 非 ASCII 字元放進 HTTP header 會讓 fetch 直接丟錯，格式不對就當作失效連結
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

/** none：沒有球隊連結；checking：驗證中；invalid：連結失效；error：連線失敗 */
export type AccessStatus = 'none' | 'checking' | 'ok' | 'invalid' | 'error'

function readToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // 無痕模式寫不進去時只在這個分頁有效
  }
}

export const useAccessStore = defineStore('access', () => {
  const token = ref<string | null>(readToken())
  const status = ref<AccessStatus>('checking')
  const errorText = ref('')
  let started = false
  let seq = 0

  /** 以目前的 token 載入帳本，依結果決定能不能進入 */
  async function verify() {
    started = true
    const my = ++seq
    const t = token.value
    const ledger = useLedgerStore()
    ledger.reset()
    if (!t || !TOKEN_RE.test(t)) {
      repo.setTeamToken(null)
      status.value = t ? 'invalid' : 'none'
      return
    }
    repo.setTeamToken(t)
    status.value = 'checking'
    try {
      await ledger.refresh()
      if (my === seq) status.value = 'ok'
    } catch (e) {
      if (my !== seq) return
      if (e instanceof InvalidTokenError) {
        status.value = 'invalid'
      } else {
        errorText.value = errorMessage(e)
        status.value = 'error'
      }
    }
  }

  /** 首次載入時呼叫；若 #/t/:token 已經觸發驗證就不重複 */
  function init() {
    if (!started) void verify()
  }

  /** 改用另一個球隊 token（或 null 清除）並重新驗證 */
  function use(next: string | null) {
    token.value = next
    writeToken(next)
    return verify()
  }

  /** 自己換發 token 後沿用目前的資料，不重新驗證 */
  function replace(next: string) {
    token.value = next
    writeToken(next)
    repo.setTeamToken(next)
  }

  /** 使用中途發現 token 已被別人重新產生 */
  function markInvalid() {
    if (status.value === 'ok') status.value = 'invalid'
  }

  return { token, status, errorText, init, verify, use, replace, markInvalid }
})
