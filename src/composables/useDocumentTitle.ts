import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useLedgerStore } from '@/stores/ledger'
import { composeTitle } from '@/lib/title'

const publicTeamName = ref<string | null>(null)

/** 分享頁不會載入管理端 ledger store，由頁面自行提供 team_name；離開時傳 null */
export function setPublicTeamName(name: string | null) {
  publicTeamName.value = name
}

/** 依目前路由的 meta.title 與 team_name 同步 document.title，只在 App 根元件呼叫一次 */
export function useDocumentTitle() {
  const route = useRoute()
  const ledger = useLedgerStore()
  watchEffect(() => {
    document.title = composeTitle(route.meta.title, publicTeamName.value ?? ledger.data.team_name)
  })
}
