import { ref, watch } from 'vue'

const KEY = 'pbl-whoami'

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

const me = ref<string | null>(read())
watch(me, (v) => {
  try {
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
  } catch {
    // 記不住就每次重選
  }
})

export function useWhoAmI() {
  return me
}
