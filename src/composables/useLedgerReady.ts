import { onMounted } from 'vue'
import { useLedgerStore } from '@/stores/ledger'
import { errorMessage, toast } from './useToast'

export function useLedgerReady() {
  const ledger = useLedgerStore()
  onMounted(() => {
    ledger.ensureLoaded().catch((e) => toast.error(`讀取資料失敗：${errorMessage(e)}`))
  })
  return ledger
}
