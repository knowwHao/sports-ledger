<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import MemberPicker from './MemberPicker.vue'
import MemberAvatar from './MemberAvatar.vue'
import type { Expense, Id } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { attendeeIds } from '@/lib/ledger'
import { formatMoney, MAX_AMOUNT } from '@/lib/format'
import { errorMessage, toast } from '@/composables/useToast'

const props = defineProps<{ open: boolean; sessionId: Id; expense?: Expense | null; suggestions?: string[] }>()
const emit = defineEmits<{ close: [] }>()
const ledger = useLedgerStore()

const form = reactive({ label: '', amount: null as number | null, payer: '', participants: [] as Id[] })
const saving = ref(false)

const attendees = computed(() => attendeeIds(ledger.data, props.sessionId))
const participantPool = computed(() => {
  const ids = new Set([...attendees.value, ...form.participants])
  return ledger.members.filter((m) => ids.has(m.id))
})
const payerPool = computed(() => {
  const ids = new Set([...attendees.value, form.payer])
  return ledger.members.filter((m) => m.active || ids.has(m.id))
})
const labelChips = computed(() => [...new Set([...(props.suggestions ?? []), '場地費', '球', '飲料'])])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const e = props.expense
    Object.assign(form, {
      label: e?.label ?? props.suggestions?.[0] ?? '場地費',
      amount: e?.amount ?? null,
      payer: e?.payer_member_id ?? attendees.value[0] ?? '',
      participants: e ? ledger.sharesOf(e.id).map((s) => s.member_id) : [...attendees.value],
    })
  },
)

const draft = computed(() => ({
  id: props.expense?.id,
  session_id: props.sessionId,
  label: form.label.trim(),
  amount: Math.round(form.amount ?? 0),
  payer_member_id: form.payer,
  participantIds: form.participants,
}))
const preview = computed(() => (form.participants.length && form.payer ? ledger.previewExpense(draft.value) : null))
const amountTooLarge = computed(() => draft.value.amount > MAX_AMOUNT)
const valid = computed(
  () => draft.value.label && draft.value.amount > 0 && !amountTooLarge.value && form.payer && form.participants.length,
)

async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  try {
    await ledger.saveExpense(draft.value)
    toast.success(props.expense ? '已更新費用' : '已新增費用')
    emit('close')
  } catch (e) {
    toast.error(`儲存失敗：${errorMessage(e)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="expense ? '編輯費用' : '新增費用'" wide @close="emit('close')">
    <form id="expense-form" class="space-y-5" @submit.prevent="submit">
      <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div>
          <label class="label" for="ex-label">項目</label>
          <input id="ex-label" v-model="form.label" class="input" maxlength="30" required />
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="c in labelChips"
              :key="c"
              type="button"
              class="chip-muted hover:bg-ink-200 dark:hover:bg-ink-700"
              @click="form.label = c"
            >
              {{ c }}
            </button>
          </div>
        </div>
        <div>
          <label class="label" for="ex-amount">金額</label>
          <input
            id="ex-amount"
            v-model.number="form.amount"
            class="input num text-lg font-bold"
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
      </div>

      <div>
        <span class="label">誰墊付？</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="m in payerPool"
            :key="m.id"
            type="button"
            :aria-pressed="form.payer === m.id"
            class="flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm font-semibold transition"
            :class="
              form.payer === m.id
                ? 'border-ink-900 bg-ink-900 text-white dark:border-ball-400 dark:bg-ball-400 dark:text-ink-950'
                : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-300'
            "
            @click="form.payer = m.id"
          >
            <MemberAvatar :name="m.name" :color="m.color" size="xs" />{{ m.name }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <span class="label !mb-0">分攤對象（{{ form.participants.length }}）</span>
          <div class="flex gap-1">
            <button type="button" class="btn-ghost !px-2.5 !py-1 text-xs" @click="form.participants = [...attendees]">全部出席者</button>
            <button type="button" class="btn-ghost !px-2.5 !py-1 text-xs" @click="form.participants = []">清除</button>
          </div>
        </div>
        <MemberPicker v-model="form.participants" :members="participantPool" />
        <p v-if="!participantPool.length" class="text-sm text-ink-400">這場還沒有出席者，請先在場次頁勾選出席成員。</p>
      </div>

      <div v-if="preview && draft.amount > 0" class="rounded-3xl bg-ink-900 p-4 text-white dark:bg-ink-800">
        <div class="flex items-baseline justify-between">
          <span class="text-sm text-ink-200">每人應付</span>
          <span class="num text-2xl font-black text-ball-400">{{ formatMoney(preview.perHead) }}</span>
        </div>
        <p class="mt-1 text-xs text-ink-300">
          {{ formatMoney(draft.amount) }} ÷ {{ form.participants.length }} 人，無條件進位
          <template v-if="preview.surplus > 0">
            · 墊付者多收 <span class="num font-bold text-ball-300">{{ formatMoney(preview.surplus) }}</span>
          </template>
        </p>
      </div>
      <ul v-if="preview?.warnings.length" class="space-y-1.5">
        <li
          v-for="(w, i) in preview.warnings"
          :key="i"
          class="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"
        >
          <TriangleAlert class="mt-0.5 size-4 shrink-0" />{{ w }}
        </li>
      </ul>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="expense-form" class="btn-primary flex-1" :disabled="!valid || saving">
        {{ saving ? '儲存中…' : '儲存費用' }}
      </button>
    </template>
  </ModalSheet>
</template>
