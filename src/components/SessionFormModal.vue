<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { History, Plus, Trash2 } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import MemberPicker from './MemberPicker.vue'
import type { Session } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { OTHER_SPORT } from '@/lib/ledger'
import { formatMoney, MAX_AMOUNT, todayYmd } from '@/lib/format'
import { errorMessage, toast } from '@/composables/useToast'

const props = defineProps<{ open: boolean; session?: Session | null }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const ledger = useLedgerStore()

interface Row {
  label: string
  amount: number | null
  payer: string
}

const form = reactive({
  sportId: '' as string,
  play_date: todayYmd(),
  title: '',
  location: '',
  note: '',
  attendees: [] as string[],
  rows: [] as Row[],
})
const saving = ref(false)
const editing = computed(() => !!props.session)
const isOther = computed(() => form.sportId === '')
const sportOptions = computed(() => {
  const list = ledger.activeSports.slice()
  const current = props.session?.sport_id
  if (current && !list.some((s) => s.id === current)) list.push(ledger.idx.sport(current))
  return list
})

const lastAttendees = computed(() =>
  ledger.lastAttendeeIds(form.sportId || null).filter((id) => ledger.idx.member(id).active),
)
const locations = computed(() => {
  const list = ledger.sessions.filter((s) => s.sport_id === (form.sportId || null)).map((s) => s.location)
  return [...new Set(list.filter(Boolean))] as string[]
})

function defaultRows(sportId: string): Row[] {
  if (!sportId) return []
  return ledger.idx.sport(sportId).default_expenses.map((d) => ({ label: d.label, amount: d.amount ?? null, payer: '' }))
}

function pickSport(id: string) {
  form.sportId = id
  if (editing.value) return
  form.rows = defaultRows(id)
  form.attendees = id ? [...lastAttendees.value] : ledger.activeMembers.map((m) => m.id)
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const s = props.session
    Object.assign(form, {
      play_date: s?.play_date ?? todayYmd(),
      title: s?.title ?? '',
      location: s?.location ?? '',
      note: s?.note ?? '',
    })
    if (s) form.sportId = s.sport_id ?? ''
    else pickSport(ledger.activeSports[0]?.id ?? '')
  },
)

const filledRows = computed(() =>
  form.rows.map((r) => ({ ...r, amount: Math.round(r.amount ?? 0) })).filter((r) => r.label.trim() && r.amount > 0),
)
const rowsMissingPayer = computed(() => filledRows.value.some((r) => !r.payer))
const rowsTooLarge = computed(() => filledRows.value.some((r) => r.amount > MAX_AMOUNT))
const canSave = computed(() => {
  if (isOther.value ? !form.title.trim() : !form.play_date) return false
  if (editing.value) return true
  if (rowsTooLarge.value) return false
  if (filledRows.value.length && (!form.attendees.length || rowsMissingPayer.value)) return false
  return true
})

async function submit() {
  if (!canSave.value || saving.value) return
  saving.value = true
  const input = {
    sport_id: form.sportId || null,
    play_date: isOther.value ? null : form.play_date,
    title: form.title.trim() || null,
    location: isOther.value ? null : form.location.trim() || null,
    note: form.note.trim(),
  }
  try {
    if (props.session) {
      await ledger.updateSession(props.session.id, input)
      toast.success('已更新場次資訊')
      emit('saved', props.session.id)
    } else {
      const rows = filledRows.value.map((r) => ({
        label: r.label.trim(),
        amount: r.amount,
        payer_member_id: r.payer,
      }))
      const created = await ledger.createSession(input, form.attendees, rows)
      toast.success(rows.length ? `已新增場次與 ${rows.length} 筆費用` : '已新增場次')
      emit('saved', created.id)
    }
  } catch (e) {
    toast.error(`儲存失敗：${errorMessage(e)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="open" :title="editing ? '編輯場次資訊' : '新增場次'" wide @close="emit('close')">
    <form id="session-form" class="space-y-5" @submit.prevent="submit">
      <div>
        <span class="label">運動</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in sportOptions"
            :key="s.id"
            type="button"
            class="flex items-center gap-1.5 rounded-2xl border-2 px-3.5 py-2 text-sm font-semibold transition"
            :class="form.sportId === s.id ? 'text-ink-950' : 'border-ink-100 text-ink-500 dark:border-ink-800 dark:text-ink-300'"
            :style="form.sportId === s.id ? { backgroundColor: s.color, borderColor: s.color } : {}"
            @click="pickSport(s.id)"
          >
            <span aria-hidden="true">{{ s.emoji }}</span>{{ s.name }}
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-2xl border-2 px-3.5 py-2 text-sm font-semibold transition"
            :class="isOther ? 'border-ink-900 bg-ink-900 text-white dark:border-ink-600 dark:bg-ink-700' : 'border-ink-100 text-ink-500 dark:border-ink-800 dark:text-ink-300'"
            @click="pickSport('')"
          >
            <span aria-hidden="true">{{ OTHER_SPORT.emoji }}</span>年費／雜費
          </button>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div v-if="!isOther">
          <label class="label" for="sf-date">日期</label>
          <input id="sf-date" v-model="form.play_date" type="date" class="input" required />
        </div>
        <div :class="isOther && 'sm:col-span-2'">
          <label class="label" for="sf-title">{{ isOther ? '標題' : '標題（選填）' }}</label>
          <input
            id="sf-title"
            v-model="form.title"
            class="input"
            maxlength="40"
            :placeholder="isOther ? '例：2026 下半年年費' : '例：中秋友誼賽'"
            :required="isOther"
          />
        </div>
        <div v-if="!isOther" class="sm:col-span-2">
          <label class="label" for="sf-loc">地點（選填）</label>
          <input id="sf-loc" v-model="form.location" class="input" list="sf-locations" maxlength="40" placeholder="例：大安運動中心" />
          <datalist id="sf-locations">
            <option v-for="l in locations" :key="l" :value="l" />
          </datalist>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="sf-note">備註（選填）</label>
          <textarea id="sf-note" v-model="form.note" class="input min-h-16 resize-y" maxlength="300" />
        </div>
      </div>

      <template v-if="!editing">
        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="label !mb-0">{{ isOther ? '參與成員' : '出席成員' }}（{{ form.attendees.length }}）</span>
            <button
              v-if="!isOther"
              type="button"
              class="btn-ghost !px-2.5 !py-1 text-xs"
              :disabled="!lastAttendees.length"
              @click="form.attendees = [...lastAttendees]"
            >
              <History class="size-3.5" />沿用上一場{{ lastAttendees.length ? `（${lastAttendees.length} 人）` : '' }}
            </button>
          </div>
          <MemberPicker v-model="form.attendees" :members="ledger.activeMembers" />
        </div>

        <div>
          <span class="label">費用（金額留空的列不會建立）</span>
          <div class="space-y-2">
            <div v-for="(row, i) in form.rows" :key="i" class="grid grid-cols-[1fr_6.5rem_auto] gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]">
              <input v-model="row.label" class="input" placeholder="項目" aria-label="費用項目" maxlength="30" />
              <input
                v-model.number="row.amount"
                class="input num"
                type="number"
                inputmode="numeric"
                min="0"
                :max="MAX_AMOUNT"
                step="1"
                placeholder="金額"
                aria-label="金額"
              />
              <select
                v-model="row.payer"
                class="input col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                aria-label="墊付者"
                :class="!row.payer && (row.amount ?? 0) > 0 && 'border-amber-400'"
              >
                <option value="" disabled>誰墊付？</option>
                <option v-for="m in ledger.activeMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <button type="button" class="icon-btn self-center" aria-label="移除這列" @click="form.rows.splice(i, 1)">
                <Trash2 class="size-4" />
              </button>
            </div>
            <button type="button" class="btn-ghost !px-3 text-xs" @click="form.rows.push({ label: '', amount: null, payer: '' })">
              <Plus class="size-3.5" />新增一列
            </button>
          </div>
          <p v-if="rowsTooLarge" class="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
            單筆金額不可超過 {{ formatMoney(MAX_AMOUNT) }}
          </p>
          <p v-else-if="filledRows.length && !form.attendees.length" class="mt-2 text-xs font-semibold text-amber-600">
            要先選擇出席成員，費用才能分攤
          </p>
          <p v-else-if="rowsMissingPayer" class="mt-2 text-xs font-semibold text-amber-600">請為每筆費用選擇墊付者</p>
          <p v-else class="mt-2 text-xs text-ink-400">費用會平均分給所有出席成員，建立後可在場次頁調整分攤對象</p>
        </div>
      </template>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="session-form" class="btn-primary flex-1" :disabled="!canSave || saving">
        {{ saving ? '儲存中…' : editing ? '儲存' : '建立場次' }}
      </button>
    </template>
  </ModalSheet>
</template>
