import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useLedgerStore } from '@/stores/ledger'
import { composeTitle } from '@/lib/title'

/** 依目前路由的 meta.title 與 team_name 同步 document.title，只在 App 根元件呼叫一次 */
export function useDocumentTitle() {
  const route = useRoute()
  const ledger = useLedgerStore()
  watchEffect(() => {
    document.title = composeTitle(route.meta.title, ledger.data.team_name)
  })
}
