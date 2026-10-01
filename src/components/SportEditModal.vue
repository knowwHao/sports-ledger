<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import ColorSwatches from './ColorSwatches.vue'
import type { DefaultExpense, Sport } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { errorMessage, toast } from '@/composables/useToast'

/** sport 為 null 表示新增 */
const props = defineProps<{ open: boolean; sport: Sport | null }>()
const emit = defineEmits<{ close: [] }>()
const ledger = useLedgerStore()

const EMOJIS = ['🏓', '🏸', '🎾', '🏐', '🏀', '⚽', '⚾', '🥏', '🏊', '🚴', '🏃', '⛳', '🎳', '🧗']
const COLORS = ['#9fcc12', '#38bdf8', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#14b8a6', '#eab308', '#64748b']

const form = reactive({
  name: '',
  emoji: '🏓',
  color: COLORS[0],
  rows: [] as { label: string; amount: number | null }[],
})
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const s = props.sport
    Object.assign(form, {
      name: s?.name ?? '',
      emoji: s?.emoji ?? EMOJIS[ledger.sports.length % EMOJIS.length],
      color: s?.color ?? COLORS[ledger.sports.length % COLORS.length],
      rows: s ? s.default_expenses.map((d) => ({ label: d.label, amount: d.amount ?? null })) : [{ label: '場地費', amount: null }],
    })
  },
)

const duplicate = computed(() => ledger.data.sports.some((s) => s.id !== props.sport?.id && s.name === form.name.trim()))
const valid = computed(() => form.name.trim() && form.emoji.trim() && !duplicate.value)

async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  const default_expenses: DefaultExpense[] = form.rows
    .filter((r) => r.label.trim())
    .map((r) => ({ label: r.label.trim(), amount: r.amount && r.amount > 0 ? Math.round(r.amount) : null }))
  const input = { name: form.name.trim(), emoji: form.emoji.trim(), color: form.color, default_expenses }
  try {
    if (props.sport) await ledger.updateSport(props.sport.id, input)
    else await ledger.createSport(input)
    toast.success(props.sport ? '已更新運動' : `已新增「${input.name}」`)
    emit('close')
  } catch (e) {
    toast.error(`儲存失敗：${errorMessage(e)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="sport ? '編輯運動' : '新增運動'" @close="emit('close')">
    <form id="sport-form" class="space-y-5" @submit.prevent="submit">
      <div class="flex items-end gap-3">
        <div
          class="flex size-14 shrink-0 items-center justify-center rounded-2xl text-3xl"
          :style="{ backgroundColor: `${form.color}33` }"
          aria-hidden="true"
        >
          {{ form.emoji || '?' }}
        </div>
        <div class="flex-1">
          <label class="label" for="sp-name">名稱</label>
          <input id="sp-name" v-model="form.name" class="input" maxlength="12" placeholder="例：網球" required />
        </div>
      </div>
      <p v-if="duplicate" class="-mt-3 text-xs font-semibold text-rose-500">已經有同名的運動</p>

      <div>
        <span class="label">圖示</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="e in EMOJIS"
            :key="e"
            type="button"
            class="flex size-10 items-center justify-center rounded-xl text-xl transition"
            :class="form.emoji === e ? 'bg-ink-900 dark:bg-ink-700' : 'bg-ink-50 hover:bg-ink-100 dark:bg-ink-800'"
            :aria-pressed="form.emoji === e"
            @click="form.emoji = e"
          >
            {{ e }}
          </button>
          <input v-model="form.emoji" class="input !w-20 text-center" maxlength="4" aria-label="自訂圖示" />
        </div>
      </div>

      <div>
        <span class="label">代表色</span>
        <ColorSwatches v-model="form.color" :colors="COLORS" />
      </div>

      <div>
        <span class="label">預設費用（新增場次時自動帶入）</span>
        <div class="space-y-2">
          <div v-for="(r, i) in form.rows" :key="i" class="flex gap-2">
            <input v-model="r.label" class="input flex-1" placeholder="項目" maxlength="30" aria-label="項目" />
            <input
              v-model.number="r.amount"
              class="input num !w-28"
              type="number"
              inputmode="numeric"
              min="0"
              placeholder="預設金額"
              aria-label="預設金額"
            />
            <button type="button" class="icon-btn shrink-0" aria-label="移除" @click="form.rows.splice(i, 1)">
              <Trash2 class="size-4" />
            </button>
          </div>
          <button type="button" class="btn-ghost !px-3 text-xs" @click="form.rows.push({ label: '', amount: null })">
            <Plus class="size-3.5" />新增項目
          </button>
        </div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="sport-form" class="btn-primary flex-1" :disabled="!valid || saving">儲存</button>
    </template>
  </ModalSheet>
</template>
