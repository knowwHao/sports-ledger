import { defineStore } from 'pinia'
import { ref } from 'vue'
import { repo } from '@/data'
import type { AuthUser } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isAdmin = ref(false)
  const ready = ref(false)
  let initPromise: Promise<void> | null = null

  async function sync(u: AuthUser | null) {
    user.value = u
    try {
      isAdmin.value = u ? await repo.isAdmin() : false
    } catch {
      isAdmin.value = false
    }
  }

  function init() {
    initPromise ??= (async () => {
      await sync(await repo.getUser())
      repo.onAuthChange((u) => {
        // supabase-js 在 onAuthStateChange 回呼內再呼叫 auth API 會互相等鎖卡死，延到下一輪執行
        if (u?.id !== user.value?.id) setTimeout(() => void sync(u), 0)
      })
      ready.value = true
    })()
    return initPromise
  }

  async function signIn(email: string, password: string) {
    await repo.signIn(email, password)
    await sync(await repo.getUser())
  }

  async function signOut() {
    await repo.signOut()
    await sync(null)
  }

  return { user, isAdmin, ready, init, signIn, signOut }
})
