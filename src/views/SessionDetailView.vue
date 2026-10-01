<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Check,
  CircleDollarSign,
  Info,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Receipt,
  SearchX,
  Trash2,
  UserCheck,
} from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import MemberPicker from '@/components/MemberPicker.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import SportBadge from '@/components/SportBadge.vue'
import SessionStatusChip from '@/components/SessionStatusChip.vue'
import SessionFormModal from '@/components/SessionFormModal.vue'
import ExpenseEditor from '@/components/ExpenseEditor.vue'
import PaymentModal from '@/components/PaymentModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { attendeeIds, sessionTotals } from '@/lib/ledger'
import { computeDues, sessionCoverage, type PairCoverage } from '@/lib/balance'
import { formatDate, formatMoney, sessionTitle } from '@/lib/format'
import type { Expense, Id, Member, PaymentPreset } from '@/types'

const ledger = useLedgerReady()
const route = useRoute()
const router = useRouter()

const sessionId = computed(() => String(route.params.id))
const session = computed(() => ledger.idx.sessions.get(sessionId.value))
const sport = computed(() => ledger.idx.sport(session.value?.sport_id ?? null))
const locked = computed(() => !!session.value?.locked)
const isFee = computed(() => !session.value?.play_date)

const attendees = computed(() => attendeeIds(ledger.data, sessionId.value))
const pickerMembers = computed(() => {
  const ids = new Set(attendees.value)
  return ledger.members.filter((m) => m.active || ids.has(m.id))
})
const expenses = computed(() =>
  ledger.data.expenses
    .filter((e) => e.session_id === sessionId.value)
    .sort((a, b) => a.created_at.localeCompare(b.created_at)),
)
const totals = computed(() => sessionTotals(ledger.data, sessionId.value))
const coverage = computed(() => sessionCoverage(ledger.data, sessionId.value))
const remaining = computed(() => coverage.value.reduce((s, p) => s + Math.max(0, p.due - p.paid), 0))
const settledBy = computed(() => ledger.summary.settlements.get(sessionId.value))

interface MemberRow {
  member: Member
  due: number
  paid: number
  pairs: PairCoverage[]
}
const rows = computed<MemberRow[]>(() => {
  const map = new Map<Id, MemberRow>()
  for (const p of coverage.value) {
    const row = map.get(p.member_id) ?? { member: ledger.idx.member(p.member_id), due: 0, paid: 0, pairs: [] }
    row.due += p.due
    row.paid += Math.min(p.paid, p.due)
    row.pairs.push(p)
    map.set(p.member_id, row)
  }
  const order = new Map(ledger.members.map((m, i) => [m.id, i]))
  return [...map.values()].sort((a, b) => (order.get(a.member.id) ?? 0) - (order.get(b.member.id) ?? 0))
})

const payers = computed(() => {
  const map = new Map<Id, { member: Member; advanced: number; receivable: number; received: number }>()
  for (const e of expenses.value) {
    const r = map.get(e.payer_member_id) ?? { member: ledger.idx.member(e.payer_member_id), advanced: 0, receivable: 0, received: 0 }
    r.advanced += e.amount
    map.set(e.payer_member_id, r)
  }
  for (const p of coverage.value) {
    const r = map.get(p.payer_id)
    if (!r) continue
    r.receivable += p.due
    r.received += Math.min(p.paid, p.due)
  }
  return [...map.values()]
})

function expenseInfo(e: Expense) {
  const shares = ledger.sharesOf(e.id)
  const { perHead, surplus } = computeDues(e.amount, shares.map((s) => s.member_id))
  return { count: shares.length, perHead, surplus, payer: ledger.idx.member(e.payer_member_id) }
}


const savingAttendance = ref(false)
async function onAttendance(next: Id[]) {
  if (locked.value || savingAttendance.value) return
  const plan = ledger.planAttendance(sessionId.value, next)
  if (plan.warnings.length) {
    const ok = await confirmDialog({
      title: '調整出席會影響已付款項',
      message: '費用分攤會跟著重算，下列付款紀錄會保留：',
      details: plan.warnings,
      confirmText: '仍要調整',
    })
    if (!ok) return
  }
  savingAttendance.value = true
  try {
    await ledger.applyAttendance(plan)
    if (plan.updates.length) toast.info(`已更新出席並重算 ${plan.updates.length} 筆費用的分攤`)
  } catch (e) {
    toast.error(`更新出席失敗：${errorMessage(e)}`)
  } finally {
    savingAttendance.value = false
  }
}


const editor = ref<{ open: boolean; expense: Expense | null }>({ open: false, expense: null })
const suggestions = computed(() => sport.value.default_expenses.map((d) => d.label))

async function removeExpense(e: Expense) {
  const ok = await confirmDialog({
    title: `刪除「${e.label}」？`,
    message: `${formatMoney(e.amount)} 的分攤紀錄會一併刪除；已記錄的付款會保留並計入個人餘額。`,
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  try {
    await ledger.deleteExpense(e.id)
    toast.success('已刪除費用')
  } catch (err) {
    toast.error(`刪除失敗：${errorMessage(err)}`)
  }
}


const busyPair = ref<string | null>(null)
const paymentPreset = ref<PaymentPreset | null>(null)
const pairKey = (p: PairCoverage) => `${p.member_id}>${p.payer_id}`

async function togglePair(p: PairCoverage) {
  busyPair.value = pairKey(p)
  try {
    if (p.payments.length) {
      const ok = await confirmDialog({
        title: '取消已付紀錄？',
        message: `會刪除 ${ledger.idx.member(p.member_id).name} 在本場付給 ${ledger.idx.member(p.payer_id).name} 的 ${p.payments.length} 筆付款（共 ${formatMoney(p.paid)}）。`,
        confirmText: '刪除付款',
        danger: true,
      })
      if (!ok) return
      await ledger.deletePayments(p.payments.map((x) => x.id))
      toast.info('已取消付款紀錄')
    } else {
      await ledger.payDirect(sessionId.value, p.member_id, p.payer_id, p.due)
      toast.success(`${ledger.idx.member(p.member_id).name} 已付給 ${ledger.idx.member(p.payer_id).name} ${formatMoney(p.due)}`)
    }
  } catch (e) {
    toast.error(`操作失敗：${errorMessage(e)}`)
  } finally {
    busyPair.value = null
  }
}

function partial(p: PairCoverage) {
  paymentPreset.value = {
    from: p.member_id,
    to: p.payer_id,
    amount: Math.max(1, p.due - p.paid),
    sessionId: sessionId.value,
    title: `${ledger.idx.member(p.member_id).name} 付給 ${ledger.idx.member(p.payer_id).name}`,
    fixedParties: true,
  }
}


const showInfo = ref(false)

async function toggleLock() {
  if (!session.value) return
  try {
    await ledger.updateSession(session.value.id, { locked: !locked.value })
    toast.success(locked.value ? '已鎖定：出席與費用不能再修改' : '已解鎖')
  } catch (e) {
    toast.error(`操作失敗：${errorMessage(e)}`)
  }
}

async function removeSession() {
  if (!session.value) return
  const directPayments = ledger.data.payments.filter((p) => p.session_id === sessionId.value).length
  const ok = await confirmDialog({
    title: `刪除「${sessionTitle(session.value)}」？`,
    message: '刪除後無法復原。',
    details: [
      `${expenses.value.length} 筆費用與分攤紀錄`,
      ...(directPayments ? [`本場的 ${directPayments} 筆直接付款紀錄`] : []),
    ],
    confirmText: '刪除場次',
    danger: true,
  })
  if (!ok) return
  try {
    await ledger.deleteSession(sessionId.value)
    toast.success('已刪除場次')
    router.replace('/sessions')
  } catch (e) {
    toast.error(`刪除失敗：${errorMessage(e)}`)
  }
}
</script>

<template>
  <div>
    <SkeletonList v-if="!ledger.loaded" :rows="4" />

    <EmptyState v-else-if="!session" :icon="SearchX" title="找不到這個場次" description="可能已經被刪除了">
      <RouterLink to="/sessions" class="btn-primary">回場次列表</RouterLink>
    </EmptyState>

    <template v-else>
      <PageHeader :title="sessionTitle(session)" back="/sessions">
        <button type="button" class="icon-btn" title="編輯資訊" aria-label="編輯資訊" @click="showInfo = true">
          <Pencil class="size-5" />
        </button>
        <button
          type="button"
          class="icon-btn"
          :title="locked ? '解鎖' : '鎖定'"
          :aria-label="locked ? '解鎖' : '鎖定'"
          @click="toggleLock"
        >
          <component :is="locked ? LockOpen : Lock" class="size-5" />
        </button>
        <button type="button" class="icon-btn hover:!text-rose-600" title="刪除場次" aria-label="刪除場次" @click="removeSession">
          <Trash2 class="size-5" />
        </button>
      </PageHeader>

      <div class="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-sm text-ink-400 dark:text-ink-300">
        <SportBadge :sport="sport" size="md" />
        <span v-if="session.play_date">{{ formatDate(session.play_date, true) }}</span>
        <span v-if="session.location">· {{ session.location }}</span>
        <SessionStatusChip :session-id="session.id" />
        <span v-if="locked" class="chip-muted"><Lock class="size-3" />已鎖定</span>
      </div>

      <p v-if="session.note" class="card mb-5 px-4 py-3 text-sm whitespace-pre-line text-ink-500 dark:text-ink-300">
        {{ session.note }}
      </p>

      <div class="mb-6 grid grid-cols-3 gap-3">
        <div class="card p-4">
          <p class="text-xs font-semibold text-ink-400">總金額</p>
          <p class="num mt-1 text-xl font-black sm:text-2xl">{{ formatMoney(totals.total) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs font-semibold text-ink-400">{{ isFee ? '參與' : '出席' }}</p>
          <p class="num mt-1 text-xl font-black sm:text-2xl">{{ totals.attendeeCount }} <span class="text-sm font-semibold">人</span></p>
        </div>
        <div class="card p-4">
          <p class="text-xs font-semibold text-ink-400">同場未付</p>
          <p class="num mt-1 text-xl font-black sm:text-2xl" :class="remaining > 0 && !settledBy && 'text-rose-600 dark:text-rose-400'">
            {{ formatMoney(remaining) }}
          </p>
        </div>
      </div>

      <div
        v-if="settledBy === 'netted' && remaining > 0"
        class="mb-6 flex gap-3 rounded-3xl bg-ball-100 p-4 text-sm text-ink-700 dark:bg-ball-400/10 dark:text-ball-200"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        本場之後全隊淨餘額曾經歸零，已視為透過抵銷結清；上方「同場未付」僅供參考。
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section class="space-y-6">
          <div class="card p-5">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="flex items-center gap-2 font-bold"><UserCheck class="size-5 text-ink-400" />{{ isFee ? '參與成員' : '出席' }}</h2>
              <span v-if="locked" class="text-xs text-ink-400">已鎖定</span>
            </div>
            <MemberPicker
              :model-value="attendees"
              :members="pickerMembers"
              :disabled="locked || savingAttendance"
              @update:model-value="onAttendance"
            />
            <p v-if="!pickerMembers.length" class="text-sm text-ink-400">還沒有成員，先到成員頁新增。</p>
          </div>

          <div class="card overflow-hidden">
            <div class="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 class="flex items-center gap-2 font-bold"><Receipt class="size-5 text-ink-400" />費用</h2>
              <button
                type="button"
                class="btn-primary !px-3 !py-1.5 text-xs"
                :disabled="locked || !attendees.length"
                @click="editor = { open: true, expense: null }"
              >
                <Plus class="size-3.5" />新增費用
              </button>
            </div>
            <ul v-if="expenses.length" class="divide-y divide-ink-100 dark:divide-ink-800">
              <li v-for="e in expenses" :key="e.id" class="flex items-center gap-3 px-5 py-3.5">
                <MemberAvatar :name="expenseInfo(e).payer.name" :color="expenseInfo(e).payer.color" size="sm" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ e.label }}</p>
                  <p class="truncate text-xs text-ink-400 dark:text-ink-300">
                    {{ expenseInfo(e).payer.name }} 墊付 · {{ expenseInfo(e).count }} 人分攤，每人
                    {{ formatMoney(expenseInfo(e).perHead) }}
                    <template v-if="expenseInfo(e).surplus > 0">
                      · 墊付者多收 {{ formatMoney(expenseInfo(e).surplus) }}
                    </template>
                  </p>
                </div>
                <span class="num font-bold">{{ formatMoney(e.amount) }}</span>
                <div v-if="!locked" class="flex">
                  <button type="button" class="icon-btn !size-8" aria-label="編輯費用" @click="editor = { open: true, expense: e }">
                    <Pencil class="size-4" />
                  </button>
                  <button type="button" class="icon-btn !size-8 hover:!text-rose-600" aria-label="刪除費用" @click="removeExpense(e)">
                    <Trash2 class="size-4" />
                  </button>
                </div>
              </li>
            </ul>
            <EmptyState
              v-else
              :icon="Receipt"
              title="還沒有費用"
              :description="attendees.length ? '新增場地費、球錢等費用，系統會自動分攤' : '先勾選出席成員再新增費用'"
            />
          </div>

          <div v-if="payers.length" class="card p-5">
            <h2 class="mb-3 flex items-center gap-2 font-bold"><CircleDollarSign class="size-5 text-ink-400" />墊付者</h2>
            <ul class="space-y-3">
              <li v-for="p in payers" :key="p.member.id" class="flex items-center gap-3">
                <MemberAvatar :name="p.member.name" :color="p.member.color" size="sm" />
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ p.member.name }}</p>
                  <p class="text-xs text-ink-400 dark:text-ink-300">墊付 {{ formatMoney(p.advanced) }} · 應收 {{ formatMoney(p.receivable) }}</p>
                </div>
                <span class="num text-sm font-bold">已收 {{ formatMoney(p.received) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <section>
          <div class="card overflow-hidden">
            <div class="px-5 pt-5 pb-3">
              <h2 class="font-bold">付款追蹤</h2>
              <p class="mt-0.5 text-xs text-ink-400">點「已付給…」記錄同場直接付款，再點一次取消；「部分」可只付一部分</p>
            </div>
            <ul v-if="rows.length" class="divide-y divide-ink-100 dark:divide-ink-800">
              <li v-for="row in rows" :key="row.member.id" class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <MemberAvatar :name="row.member.name" :color="row.member.color" size="sm" :muted="!row.member.active" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">{{ row.member.name }}</p>
                    <p class="text-xs text-ink-400 dark:text-ink-300">
                      應付 <span class="num font-semibold">{{ formatMoney(row.due) }}</span>
                      <template v-if="row.paid > 0 && row.paid < row.due"> · 已付 {{ formatMoney(row.paid) }}</template>
                    </p>
                  </div>
                  <span v-if="row.paid >= row.due" class="chip-done"><Check class="size-3" />已付清</span>
                  <span v-else-if="row.paid > 0" class="chip-open">部分</span>
                  <span v-else class="chip-muted">未付</span>
                </div>
                <div class="mt-2.5 space-y-2 pl-11">
                  <div v-for="p in row.pairs" :key="pairKey(p)" class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="flex flex-1 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition"
                      :class="
                        p.paid >= p.due
                          ? 'border-ball-500 bg-ball-200/60 text-ink-900 dark:border-ball-400/50 dark:bg-ball-400/10 dark:text-ball-200'
                          : p.paid > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200'
                            : 'border-ink-200 hover:border-ink-400 dark:border-ink-700'
                      "
                      :disabled="busyPair === pairKey(p)"
                      @click="togglePair(p)"
                    >
                      <span class="flex min-w-0 items-center gap-1.5">
                        <Check v-if="p.paid >= p.due" class="size-4 shrink-0" />
                        <span class="truncate">
                          {{ p.paid >= p.due ? '已付給' : p.paid > 0 ? '部分付給' : '標記已付給' }}
                          {{ ledger.idx.member(p.payer_id).name }}
                        </span>
                      </span>
                      <span class="num shrink-0">
                        <template v-if="p.paid > 0 && p.paid < p.due">{{ formatMoney(p.paid) }} / </template>{{ formatMoney(p.due) }}
                      </span>
                    </button>
                    <button
                      v-if="p.paid < p.due"
                      type="button"
                      class="btn-ghost !px-2.5 !py-2 text-xs"
                      @click="partial(p)"
                    >
                      部分
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            <EmptyState v-else :icon="Check" title="沒有需要付款的人" description="新增費用後，這裡會列出每個人要付給誰多少" />
          </div>
        </section>
      </div>

      <SessionFormModal :open="showInfo" :session="session" @close="showInfo = false" @saved="showInfo = false" />
      <ExpenseEditor
        :open="editor.open"
        :session-id="session.id"
        :expense="editor.expense"
        :suggestions="suggestions"
        @close="editor = { open: false, expense: null }"
      />
      <PaymentModal :open="!!paymentPreset" :preset="paymentPreset" @close="paymentPreset = null" />
    </template>
  </div>
</template>
