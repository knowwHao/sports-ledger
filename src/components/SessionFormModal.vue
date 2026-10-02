<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ChevronDown, History, Minus, Plus, Trash2, X } from 'lucide-vue-next'
import ModalSheet from './ModalSheet.vue'
import MemberPicker from './MemberPicker.vue'
import MemberAvatar from './MemberAvatar.vue'
import type { GuestInput, Id, Session } from '@/types'
import { useLedgerStore, type ExpenseRowInput } from '@/stores/ledger'
import { useWhoAmI } from '@/composables/useWhoAmI'
import { attendeeIds, OTHER_SPORT, partyHeads, sessionGuests } from '@/lib/ledger'
import { computeDues } from '@/lib/balance'
import { formatMoney, MAX_AMOUNT, todayYmd } from '@/lib/format'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'

const props = defineProps<{ open: boolean; session?: Session | null }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const ledger = useLedgerStore()
const me = useWhoAmI()

interface Row {
  id?: Id
  label: string
  amount: number | null
  payer: Id
  /** false＝分給全部出席者 */
  custom: boolean
  participants: Id[]
}

const form = reactive({
  sportId: '' as string,
  play_date: todayYmd(),
  title: '',
  location: '',
  note: '',
  attendees: [] as Id[],
  /** member_id 為空字串表示還沒選是誰帶的 */
  guests: [] as GuestInput[],
  /** false 時只用 rows[0]，畫面上就是「總金額＋誰付的」 */
  split: false,
  rows: [] as Row[],
})
const showMore = ref(false)
const saving = ref(false)
const editing = computed(() => !!props.session)
const isOther = computed(() => form.sportId === '')
const sport = computed(() => ledger.idx.sport(form.sportId || null))
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
const attendeePool = computed(() => {
  const ids = new Set(form.attendees)
  return ledger.members.filter((m) => m.active || ids.has(m.id))
})
const MAX_GUESTS = 20
/** 年費／雜費沒有帶朋友這回事 */
const validGuests = computed(() =>
  isOther.value ? [] : form.guests.filter((g) => g.member_id && g.guests > 0).map((g) => ({ ...g, names: g.names.trim() })),
)
const guestTotal = computed(() => validGuests.value.reduce((s, g) => s + g.guests, 0))
const heads = computed(() => partyHeads(form.attendees, validGuests.value))
/** 要分攤的成員：出席的人，加上沒出席但帶朋友來的人 */
const parties = computed(() => [...heads.value.keys()])
const partyMembers = computed(() => ledger.members.filter((m) => heads.value.has(m.id)))
/** 每位成員只能有一列，已被其他列選走的不再出現 */
function hostOptions(g: GuestInput) {
  const taken = new Set(form.guests.filter((x) => x !== g).map((x) => x.member_id))
  const pool = ledger.members.filter((m) => (m.active || m.id === g.member_id) && !taken.has(m.id))
  return {
    attending: pool.filter((m) => form.attendees.includes(m.id)),
    absent: pool.filter((m) => !form.attendees.includes(m.id)),
  }
}
function addGuest() {
  form.guests.push({ member_id: '', guests: 1, names: '' })
}
function stepGuest(g: GuestInput, delta: number) {
  g.guests = Math.min(MAX_GUESTS, Math.max(1, g.guests + delta))
}
const main = computed(() => form.rows[0])
// 付錢的人不一定有出席（例如代訂場地沒來打），所以其他成員也要能選
const payerPool = computed(() => {
  const ids = new Set(form.rows.map((r) => r.payer))
  return ledger.members.filter((m) => m.active || ids.has(m.id))
})
const attendingPayers = computed(() => payerPool.value.filter((m) => form.attendees.includes(m.id)))
const otherPayers = computed(() => payerPool.value.filter((m) => !form.attendees.includes(m.id)))
const showOtherPayers = ref(false)
const otherPayersOpen = computed(
  () => showOtherPayers.value || otherPayers.value.some((m) => m.id === main.value?.payer),
)

/** 一筆總額時的費用名稱，例如羽球是「場地費＋羽球」 */
function singleLabel(sportId: string): string {
  const labels = sportId ? ledger.idx.sport(sportId).default_expenses.map((d) => d.label) : []
  return labels.join('＋') || '費用'
}

function defaultPayer(attendees: Id[]): Id {
  return me.value && attendees.includes(me.value) ? me.value : ''
}

function blankRow(label: string, amount: number | null = null, payer = ''): Row {
  return { label, amount, payer, custom: false, participants: [] }
}

function pickSport(id: string) {
  form.sportId = id
  if (editing.value) return
  form.attendees = id ? [...lastAttendees.value] : ledger.activeMembers.map((m) => m.id)
  form.guests = []
  const defaults = id ? ledger.idx.sport(id).default_expenses : []
  const known = defaults.reduce((s, d) => s + (d.amount ?? 0), 0)
  form.rows = [blankRow(singleLabel(id), known || null, defaultPayer(form.attendees))]
  form.split = false
}

function loadSession(s: Session) {
  form.sportId = s.sport_id ?? ''
  form.attendees = attendeeIds(ledger.data, s.id)
  form.guests = sessionGuests(ledger.data, s.id).map(({ member_id, guests, names }) => ({ member_id, guests, names }))
  const expenses = ledger.data.expenses
    .filter((e) => e.session_id === s.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const all = new Set(parties.value)
  form.rows = expenses.map((e) => {
    const participants = ledger.sharesOf(e.id).map((x) => x.member_id)
    const custom = participants.length !== all.size || participants.some((p) => !all.has(p))
    return { id: e.id, label: e.label, amount: e.amount, payer: e.payer_member_id, custom, participants }
  })
  if (!form.rows.length) form.rows = [blankRow(singleLabel(form.sportId), null, defaultPayer(form.attendees))]
  form.split = form.rows.length > 1
}

// 直接開 ?new=1 時元件一掛載就是開啟狀態，帳本也可能還沒載入，所以兩者都就緒才初始化
watch(
  () => props.open && ledger.loaded,
  (ready) => {
    if (!ready) return
    const s = props.session
    Object.assign(form, {
      play_date: s?.play_date ?? todayYmd(),
      title: s?.title ?? '',
      location: s?.location ?? '',
      note: s?.note ?? '',
    })
    if (s) loadSession(s)
    else pickSport(ledger.activeSports[0]?.id ?? '')
    showOtherPayers.value = false
    showMore.value = !!(s && (s.title || s.location || s.note || form.rows.some((r) => r.custom)))
  },
  { immediate: true },
)

function toggleCustom(row: Row) {
  row.custom = !row.custom
  if (row.custom && !row.participants.length) row.participants = [...parties.value]
}

function splitRows() {
  const first = form.rows[0]
  const total = Math.round(first.amount ?? 0)
  const defaults = isOther.value ? [] : sport.value.default_expenses
  if (first.id || defaults.length < 2) {
    form.rows.push(blankRow('', null, first.payer))
  } else {
    const rows = defaults.map((d) => blankRow(d.label, d.amount ?? null, first.payer))
    const known = rows.reduce((s, r) => s + (r.amount ?? 0), 0)
    const open = rows.find((r) => r.amount == null)
    if (total > known && open) open.amount = total - known
    else if (total && total !== known) {
      rows[0].amount = total
      for (const r of rows.slice(1)) r.amount = null
    }
    for (const r of rows) Object.assign(r, { custom: first.custom, participants: [...first.participants] })
    form.rows = rows
  }
  form.split = true
}

function mergeRows() {
  const filled = form.rows.filter((r) => (r.amount ?? 0) > 0)
  const first = form.rows[0]
  form.rows = [
    {
      ...first,
      label: filled.map((r) => r.label.trim()).filter(Boolean).join('＋') || first.label || singleLabel(form.sportId),
      amount: filled.reduce((s, r) => s + Math.round(r.amount ?? 0), 0) || null,
      payer: filled[0]?.payer || first.payer,
    },
  ]
  form.split = false
}

function participantsOf(r: Row): Id[] {
  return r.custom ? r.participants.filter((id) => heads.value.has(id)) : [...parties.value]
}

const filledRows = computed(() =>
  form.rows
    .map((r) => ({ row: r, amount: Math.round(r.amount ?? 0) }))
    .filter((x) => x.amount > 0),
)
const total = computed(() => filledRows.value.reduce((s, x) => s + x.amount, 0))
const problem = computed(() => {
  if (isOther.value ? !form.title.trim() : !form.play_date) return isOther.value ? '請填寫標題' : '請選擇日期'
  if (!isOther.value && form.guests.some((g) => !g.member_id)) return '請選擇朋友是誰帶的'
  if (!filledRows.value.length) return ''
  if (filledRows.value.some((x) => x.amount > MAX_AMOUNT)) return `單筆金額不可超過 ${formatMoney(MAX_AMOUNT)}`
  if (!parties.value.length) return '先勾選出席的人，費用才能分攤'
  if (filledRows.value.some((x) => !x.row.payer)) return form.split ? '每筆費用都要選誰付的' : '請選擇誰付的'
  if (form.split && filledRows.value.some((x) => !x.row.label.trim())) return '每筆費用都要有名稱'
  if (filledRows.value.some((x) => !participantsOf(x.row).length)) return '分攤對象至少要有一位出席者'
  return ''
})

const perHead = computed(() => {
  if (form.split || !main.value) return null
  const amount = Math.round(main.value.amount ?? 0)
  const ids = participantsOf(main.value)
  if (amount <= 0 || !ids.length) return null
  const guests = validGuests.value.filter((g) => ids.includes(g.member_id)).reduce((s, g) => s + g.guests, 0)
  const members = ids.filter((id) => form.attendees.includes(id)).length
  return { ...computeDues(amount, ids, heads.value), members, guests }
})

function rowInputs(): ExpenseRowInput[] {
  return filledRows.value.map(({ row, amount }) => ({
    id: row.id,
    label: row.label.trim() || singleLabel(form.sportId),
    amount,
    payer_member_id: row.payer,
    participantIds: participantsOf(row),
  }))
}

async function submit() {
  if (problem.value || saving.value) return
  const input = {
    sport_id: form.sportId || null,
    play_date: isOther.value ? null : form.play_date,
    title: form.title.trim() || null,
    location: isOther.value ? null : form.location.trim() || null,
    note: form.note.trim(),
  }
  const rows = rowInputs()
  if (props.session) {
    const warnings = ledger.sessionEditWarnings(props.session.id, form.attendees, validGuests.value, rows)
    if (warnings.length) {
      const ok = await confirmDialog({
        title: '這次修改會影響已記的付款',
        message: '分攤會重新計算，下列付款紀錄會保留：',
        details: warnings,
        confirmText: '仍要儲存',
      })
      if (!ok) return
    }
  }
  saving.value = true
  try {
    if (props.session) {
      await ledger.saveSessionEdit(props.session.id, input, form.attendees, validGuests.value, rows)
      toast.success('已儲存修改')
      emit('saved', props.session.id)
    } else {
      const created = await ledger.createSession(input, form.attendees, validGuests.value, rows)
      toast.success(rows.length ? `已記下這場，共 ${formatMoney(total.value)}` : '已新增場次')
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
  <ModalSheet :open="open" :title="editing ? '編輯場次' : '記一場'" wide @close="emit('close')">
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
            :aria-pressed="form.sportId === s.id"
            @click="pickSport(s.id)"
          >
            <span aria-hidden="true">{{ s.emoji }}</span>{{ s.name }}
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-2xl border-2 px-3.5 py-2 text-sm font-semibold transition"
            :class="isOther ? 'border-ink-900 bg-ink-900 text-white dark:border-ink-600 dark:bg-ink-700' : 'border-ink-100 text-ink-500 dark:border-ink-800 dark:text-ink-300'"
            :aria-pressed="isOther"
            @click="pickSport('')"
          >
            <span aria-hidden="true">{{ OTHER_SPORT.emoji }}</span>年費／雜費
          </button>
        </div>
      </div>

      <div v-if="isOther">
        <label class="label" for="sf-title">標題</label>
        <input id="sf-title" v-model="form.title" class="input" maxlength="40" placeholder="例：2026 下半年年費" required />
      </div>
      <div v-else>
        <label class="label" for="sf-date">日期</label>
        <input id="sf-date" v-model="form.play_date" type="date" class="input" required />
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="label !mb-0">{{ isOther ? '要分攤的人' : '出席的人' }}（{{ form.attendees.length }}）</span>
          <button
            v-if="!isOther && !editing"
            type="button"
            class="btn-ghost !px-2.5 !py-1 text-xs"
            :disabled="!lastAttendees.length"
            @click="form.attendees = [...lastAttendees]"
          >
            <History class="size-3.5" />同上一場{{ lastAttendees.length ? `（${lastAttendees.length} 人）` : '' }}
          </button>
        </div>
        <MemberPicker v-model="form.attendees" :members="attendeePool" />
      </div>

      <div v-if="!isOther">
        <span class="label">帶朋友{{ guestTotal ? `（${guestTotal} 位）` : '' }}</span>
        <ul v-if="form.guests.length" class="mb-2 space-y-2">
          <li v-for="(g, i) in form.guests" :key="i" class="rounded-2xl border border-ink-100 p-2.5 dark:border-ink-800">
            <div class="flex items-center gap-2">
              <select
                v-model="g.member_id"
                class="input min-w-0 flex-1"
                aria-label="誰帶的"
                :class="!g.member_id && 'border-amber-400'"
              >
                <option value="" disabled>誰帶的？</option>
                <optgroup v-if="hostOptions(g).attending.length" label="出席的人">
                  <option v-for="m in hostOptions(g).attending" :key="m.id" :value="m.id">{{ m.name }} 帶的</option>
                </optgroup>
                <optgroup v-if="hostOptions(g).absent.length" label="沒出席的人（讓朋友代打）">
                  <option v-for="m in hostOptions(g).absent" :key="m.id" :value="m.id">{{ m.name }} 帶的</option>
                </optgroup>
              </select>
              <div class="flex shrink-0 items-center rounded-2xl border border-ink-200 dark:border-ink-700">
                <button type="button" class="icon-btn !size-9" aria-label="少一位" :disabled="g.guests <= 1" @click="stepGuest(g, -1)">
                  <Minus class="size-4" />
                </button>
                <span class="num w-6 text-center font-bold" aria-live="polite">{{ g.guests }}</span>
                <button type="button" class="icon-btn !size-9" aria-label="多一位" :disabled="g.guests >= MAX_GUESTS" @click="stepGuest(g, 1)">
                  <Plus class="size-4" />
                </button>
              </div>
              <button type="button" class="icon-btn shrink-0" aria-label="移除這列" @click="form.guests.splice(i, 1)">
                <X class="size-4" />
              </button>
            </div>
            <input v-model="g.names" class="input mt-2" maxlength="40" placeholder="朋友名字（選填）" aria-label="朋友名字" />
          </li>
        </ul>
        <button type="button" class="btn-ghost !px-3 text-xs" @click="addGuest">
          <Plus class="size-3.5" />帶朋友
        </button>
        <p v-if="guestTotal" class="mt-1.5 text-xs text-ink-400 dark:text-ink-300">朋友和大家一樣平分，那份算在帶他來的人身上</p>
      </div>

      <template v-if="!form.split && main">
        <div>
          <label class="label" for="sf-total">總金額</label>
          <input
            id="sf-total"
            v-model.number="main.amount"
            class="input num text-lg font-bold"
            type="number"
            inputmode="numeric"
            min="0"
            :max="MAX_AMOUNT"
            step="1"
            placeholder="例：1200"
          />
          <p v-if="perHead" class="mt-1.5 text-xs text-ink-400 dark:text-ink-300">
            {{ perHead.members }} 人{{ perHead.guests ? `＋朋友 ${perHead.guests} 位` : '' }}平分，每人
            <span class="num font-bold text-ink-700 dark:text-ink-100">{{ formatMoney(perHead.perHead) }}</span>
            <template v-if="perHead.surplus > 0">（除不盡進位，付錢的人多收 {{ formatMoney(perHead.surplus) }}）</template>
          </p>
        </div>
        <div>
          <span class="label">誰付的？</span>
          <p v-if="!attendingPayers.length" class="mb-2 text-sm text-ink-400">先勾選{{ isOther ? '要分攤的人' : '出席的人' }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="m in otherPayersOpen ? [...attendingPayers, ...otherPayers] : attendingPayers"
              :key="m.id"
              type="button"
              :aria-pressed="main.payer === m.id"
              class="flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm font-semibold transition"
              :class="[
                main.payer === m.id
                  ? 'border-ink-900 bg-ink-900 text-white dark:border-ball-400 dark:bg-ball-400 dark:text-ink-950'
                  : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-300',
                !form.attendees.includes(m.id) && main.payer !== m.id && 'border-dashed',
              ]"
              @click="main.payer = m.id"
            >
              <MemberAvatar :name="m.name" :color="m.color" size="xs" :muted="!form.attendees.includes(m.id) && main.payer !== m.id" />{{ m.name }}
            </button>
            <button
              v-if="!otherPayersOpen && otherPayers.length"
              type="button"
              class="flex items-center gap-1 rounded-full border border-dashed border-ink-200 px-3 py-1 text-sm font-semibold text-ink-400 transition hover:text-ink-700 dark:border-ink-700 dark:hover:text-ink-100"
              @click="showOtherPayers = true"
            >
              <Plus class="size-3.5" />{{ isOther ? '其他人' : '沒出席的人' }}
            </button>
          </div>
          <p v-if="main.payer && !heads.has(main.payer)" class="mt-1.5 text-xs text-ink-400 dark:text-ink-300">
            {{ ledger.idx.member(main.payer).name }} 只墊錢、不分攤，{{ isOther ? '分攤的人' : '出席的人' }}的錢都付給他
          </p>
        </div>
      </template>

      <div v-else class="space-y-3">
        <div class="flex items-baseline justify-between">
          <span class="label !mb-0">費用明細</span>
          <span class="text-sm text-ink-400">合計 <span class="num font-bold text-ink-700 dark:text-ink-100">{{ formatMoney(total) }}</span></span>
        </div>
        <div v-for="(row, i) in form.rows" :key="row.id ?? `n${i}`" class="rounded-2xl border border-ink-100 p-3 dark:border-ink-800">
          <div class="grid grid-cols-[1fr_6.5rem_auto] gap-2">
            <input v-model="row.label" class="input" placeholder="項目，例：場地費" aria-label="費用項目" maxlength="30" />
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
            <button type="button" class="icon-btn self-center" aria-label="移除這筆" :disabled="form.rows.length < 2" @click="form.rows.splice(i, 1)">
              <Trash2 class="size-4" />
            </button>
            <select
              v-model="row.payer"
              class="input col-span-3"
              aria-label="誰付的"
              :class="!row.payer && (row.amount ?? 0) > 0 && 'border-amber-400'"
            >
              <option value="" disabled>誰付的？</option>
              <optgroup :label="isOther ? '分攤的人' : '出席的人'">
                <option v-for="m in attendingPayers" :key="m.id" :value="m.id">{{ m.name }} 付的</option>
              </optgroup>
              <optgroup v-if="otherPayers.length" :label="isOther ? '其他人（不分攤）' : '沒出席的人（不分攤）'">
                <option v-for="m in otherPayers" :key="m.id" :value="m.id">{{ m.name }} 付的</option>
              </optgroup>
            </select>
          </div>
          <button type="button" class="mt-2 text-xs font-semibold text-ink-400 hover:text-ink-700 dark:hover:text-ink-100" @click="toggleCustom(row)">
            {{ row.custom ? `只分給 ${participantsOf(row).length} 人（改回全部出席者）` : '分給全部出席者（改成只分給部分人）' }}
          </button>
          <MemberPicker v-if="row.custom" v-model="row.participants" class="mt-2" :members="partyMembers" />
        </div>
        <button type="button" class="btn-ghost !px-3 text-xs" @click="form.rows.push(blankRow('', null, form.rows[0]?.payer ?? ''))">
          <Plus class="size-3.5" />再加一筆
        </button>
      </div>

      <div class="border-t border-ink-100 pt-4 dark:border-ink-800">
        <button
          type="button"
          class="flex w-full items-center justify-between text-sm font-semibold text-ink-500 dark:text-ink-300"
          :aria-expanded="showMore"
          @click="showMore = !showMore"
        >
          更多選項
          <ChevronDown class="size-4 transition" :class="showMore && 'rotate-180'" />
        </button>
        <div v-if="showMore" class="mt-4 space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div v-if="!isOther">
              <label class="label" for="sf-title2">標題</label>
              <input id="sf-title2" v-model="form.title" class="input" maxlength="40" placeholder="例：中秋友誼賽" />
            </div>
            <div v-if="!isOther">
              <label class="label" for="sf-loc">地點</label>
              <input id="sf-loc" v-model="form.location" class="input" list="sf-locations" maxlength="40" placeholder="例：大安運動中心" />
              <datalist id="sf-locations">
                <option v-for="l in locations" :key="l" :value="l" />
              </datalist>
            </div>
            <div class="sm:col-span-2">
              <label class="label" for="sf-note">備註</label>
              <textarea id="sf-note" v-model="form.note" class="input min-h-16 resize-y" maxlength="300" />
            </div>
          </div>

          <div v-if="!form.split && main" class="space-y-2">
            <span class="label !mb-0">分給誰</span>
            <button type="button" class="btn-outline !px-3 !py-1.5 text-xs" @click="toggleCustom(main)">
              {{ main.custom ? '改回分給全部出席者' : '只分給部分人' }}
            </button>
            <MemberPicker v-if="main.custom" v-model="main.participants" :members="partyMembers" />
          </div>

          <div class="space-y-1.5">
            <span class="label !mb-0">費用拆分</span>
            <button v-if="!form.split" type="button" class="btn-outline !px-3 !py-1.5 text-xs" @click="splitRows">
              拆成多筆費用{{ !isOther && sport.default_expenses.length > 1 ? `（${sport.default_expenses.map((d) => d.label).join('、')}）` : '' }}
            </button>
            <button v-else type="button" class="btn-outline !px-3 !py-1.5 text-xs" @click="mergeRows">合併成一筆總金額</button>
            <p class="text-xs text-ink-400">
              {{ form.split ? '合併後金額相加，以第一筆的付款人為準' : '不同人付不同項目、或某項只分給部分人時才需要拆開' }}
            </p>
          </div>
        </div>
      </div>
    </form>
    <template #footer>
      <div class="flex w-full flex-col gap-2">
        <p v-if="problem" class="text-xs font-semibold text-amber-600">{{ problem }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
          <button type="submit" form="session-form" class="btn-primary flex-1" :disabled="!!problem || saving">
            {{ saving ? '儲存中…' : editing ? '儲存' : '記下這場' }}
          </button>
        </div>
      </div>
    </template>
  </ModalSheet>
</template>
