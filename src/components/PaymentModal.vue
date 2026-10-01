<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowDown } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import { useLedgerStore } from '@/stores/ledger'
import { formatMoney, MAX_AMOUNT, parseDate, todayYmd } from '@/lib/format'
import { errorMessage, toast } from '@/composables/useToast'
import type { PaymentPreset } from '@/types'

const props = defineProps<{ open: boolean; preset?: PaymentPreset | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const ledger = useLedgerStore()

const form = reactive({ from: '', to: '', amount: null as number | null, date: todayYmd(), note: '' })
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      from: props.preset?.from ?? '',
      to: props.preset?.to ?? '',
      amount: props.preset?.amount ?? null,
      date: todayYmd(),
      note: '',
    })
  },
)

const people = computed(() => {
  const ids = new Set([form.from, form.to].filter(Boolean))
  return ledger.members.filter((m) => m.active || ids.has(m.id))
})
const amount = computed(() => Math.round(form.amount ?? 0))
const amountTooLarge = computed(() => amount.value > MAX_AMOUNT)
const valid = computed(
  () => form.from && form.to && form.from !== form.to && amount.value > 0 && !amountTooLarge.value && form.date,
)

function paidAtFor(ymd: string): string {
  // 選今天就記錄當下時間，其他日期記成當天中午，避免時區換算後跑到前一天
  if (ymd === todayYmd()) return new Date().toISOString()
  const d = parseDate(ymd)
  d.setHours(12)
  return d.toISOString()
}

async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  try {
    await ledger.createPayment({
      from_member_id: form.from,
      to_member_id: form.to,
      amount: amount.value,
      paid_at: paidAtFor(form.date),
      session_id: props.preset?.sessionId ?? null,
      note: form.note.trim(),
    })
    toast.success('已記錄付款')
    emit('saved')
    emit('close')
  } catch (e) {
    toast.error(`記錄失敗：${errorMessage(e)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="preset?.title ?? '新增付款紀錄'" @close="emit('close')">
    <form id="payment-form" class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="pm-from">付款人</label>
        <select id="pm-from" v-model="form.from" class="input" :disabled="preset?.fixedParties" required>
          <option value="" disabled>選擇付款人</option>
          <option v-for="m in people" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </div>
      <div class="flex justify-center text-ink-300"><ArrowDown class="size-5" /></div>
      <div>
        <label class="label" for="pm-to">收款人</label>
        <select id="pm-to" v-model="form.to" class="input" :disabled="preset?.fixedParties" required>
          <option value="" disabled>選擇收款人</option>
          <option v-for="m in people" :key="m.id" :value="m.id" :disabled="m.id === form.from">{{ m.name }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="pm-amount">金額</label>
          <input
            id="pm-amount"
            v-model.number="form.amount"
            class="input num"
            type="number"
            inputmode="numeric"
            min="1"
            :max="MAX_AMOUNT"
            step="1"
            required
          />
          <p v-if="amountTooLarge" class="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
            金額不可超過 {{ formatMoney(MAX_AMOUNT) }}
          </p>
        </div>
        <div>
          <label class="label" for="pm-date">日期</label>
          <input id="pm-date" v-model="form.date" class="input" type="date" required />
        </div>
      </div>
      <div>
        <label class="label" for="pm-note">備註（選填）</label>
        <input id="pm-note" v-model="form.note" class="input" maxlength="60" placeholder="例：LINE Pay 轉帳" />
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="payment-form" class="btn-primary flex-1" :disabled="!valid || saving">
        {{ saving ? '儲存中…' : '記錄付款' }}
      </button>
    </template>
  </ModalSheet>
</template>
