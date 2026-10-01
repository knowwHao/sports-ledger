<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import MemberAvatar from './MemberAvatar.vue'
import { useLedgerStore } from '@/stores/ledger'
import { formatMoney, MAX_AMOUNT } from '@/lib/format'
import { errorMessage, toast } from '@/composables/useToast'
import type { Transfer } from '@/lib/balance'

/** received＝由收款人確認「已收到」，只差在標題與按鈕文字 */
const props = defineProps<{ transfer: Transfer | null; received?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const ledger = useLedgerStore()

const amount = ref<number | null>(null)
const saving = ref(false)

watch(
  () => props.transfer,
  (t) => {
    if (t) amount.value = t.amount
  },
)

const from = computed(() => (props.transfer ? ledger.idx.member(props.transfer.from) : null))
const to = computed(() => (props.transfer ? ledger.idx.member(props.transfer.to) : null))
const value = computed(() => Math.round(amount.value ?? 0))
const valid = computed(() => value.value > 0 && value.value <= MAX_AMOUNT)

async function submit() {
  const t = props.transfer
  if (!t || !valid.value || saving.value) return
  saving.value = true
  try {
    await ledger.recordTransfer({ ...t, amount: value.value })
    toast.success(`已記錄 ${from.value?.name} → ${to.value?.name} ${formatMoney(value.value)}`)
    emit('close')
  } catch (e) {
    toast.error(`記錄失敗：${errorMessage(e)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="!!transfer" :title="received ? '確認已收到？' : '確認已轉帳？'" @close="emit('close')">
    <form v-if="transfer && from && to" id="transfer-form" class="space-y-4" @submit.prevent="submit">
      <div class="flex items-center justify-center gap-3 rounded-3xl bg-ink-50 px-4 py-4 dark:bg-ink-950">
        <div class="flex min-w-0 flex-col items-center gap-1">
          <MemberAvatar :name="from.name" :color="from.color" />
          <span class="max-w-24 truncate text-sm font-semibold">{{ from.name }}</span>
        </div>
        <ArrowRight class="size-5 shrink-0 text-ink-300" />
        <div class="flex min-w-0 flex-col items-center gap-1">
          <MemberAvatar :name="to.name" :color="to.color" />
          <span class="max-w-24 truncate text-sm font-semibold">{{ to.name }}</span>
        </div>
      </div>
      <div>
        <label class="label" for="tf-amount">金額</label>
        <input
          id="tf-amount"
          v-model.number="amount"
          class="input num text-lg font-bold"
          type="number"
          inputmode="numeric"
          min="1"
          :max="MAX_AMOUNT"
          step="1"
          required
        />
        <p class="mt-1.5 text-xs text-ink-400 dark:text-ink-300">
          <template v-if="value > 0 && value < transfer.amount">只轉一部分也可以，剩下的 {{ formatMoney(transfer.amount - value) }} 會留在帳上</template>
          <template v-else-if="value > transfer.amount">比建議的 {{ formatMoney(transfer.amount) }} 多，多出的部分也會記在帳上</template>
          <template v-else>照建議金額付，這筆就清了</template>
        </p>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="transfer-form" class="btn-primary flex-1" :disabled="!valid || saving">
        {{ saving ? '記錄中…' : received ? '確認已收到' : '確認已轉帳' }}
      </button>
    </template>
  </ModalSheet>
</template>
