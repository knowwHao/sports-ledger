<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Circle, CircleCheck, Ellipsis, Info, Lock, LockOpen, Pencil, Receipt, SearchX, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import SportBadge from '@/components/SportBadge.vue'
import SessionStatusChip from '@/components/SessionStatusChip.vue'
import SessionFormModal from '@/components/SessionFormModal.vue'
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

const attendees = computed(() => attendeeIds(ledger.data, sessionId.value).map((id) => ledger.idx.member(id)))
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
const unpaidCount = computed(() => rows.value.filter((r) => r.paid < r.due).length)

const payers = computed(() => {
  const map = new Map<Id, { member: Member; advanced: number }>()
  for (const e of expenses.value) {
    const r = map.get(e.payer_member_id) ?? { member: ledger.idx.member(e.payer_member_id), advanced: 0 }
    r.advanced += e.amount
    map.set(e.payer_member_id, r)
  }
  return [...map.values()]
})

function expenseInfo(e: Expense) {
  const shares = ledger.sharesOf(e.id)
  const { perHead, surplus } = computeDues(e.amount, shares.map((s) => s.member_id))
  return { count: shares.length, perHead, surplus, payer: ledger.idx.member(e.payer_member_id) }
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
        message: `會刪除 ${ledger.idx.member(p.member_id).name} 在這場付給 ${ledger.idx.member(p.payer_id).name} 的 ${p.payments.length} 筆付款（共 ${formatMoney(p.paid)}）。`,
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


const showEdit = ref(false)
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) menuOpen.value = false
}
watch(menuOpen, (open) => {
  if (open) document.addEventListener('click', onDocClick, true)
  else document.removeEventListener('click', onDocClick, true)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true))

async function toggleLock() {
  menuOpen.value = false
  if (!session.value) return
  try {
    await ledger.updateSession(session.value.id, { locked: !locked.value })
    toast.success(locked.value ? '已鎖定：出席與費用不能再修改' : '已解鎖')
  } catch (e) {
    toast.error(`操作失敗：${errorMessage(e)}`)
  }
}

async function removeSession() {
  menuOpen.value = false
  if (!session.value) return
  const directPayments = ledger.data.payments.filter((p) => p.session_id === sessionId.value).length
  const ok = await confirmDialog({
    title: `刪除「${sessionTitle(session.value)}」？`,
    message: '刪除後無法復原。',
    details: [
      `${expenses.value.length} 筆費用與分攤紀錄`,
      ...(directPayments ? [`這場的 ${directPayments} 筆當場付款紀錄`] : []),
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
        <button
          type="button"
          class="btn-outline !px-3 !py-2"
          :disabled="locked"
          :title="locked ? '已鎖定，要修改請先從「⋯」解鎖' : '修改出席與費用'"
          @click="showEdit = true"
        >
          <Pencil class="size-4" />編輯
        </button>
        <div ref="menuRef" class="relative">
          <button
            type="button"
            class="icon-btn"
            aria-label="更多操作"
            :aria-expanded="menuOpen"
            aria-haspopup="menu"
            @click="menuOpen = !menuOpen"
          >
            <Ellipsis class="size-5" />
          </button>
          <div
            v-if="menuOpen"
            role="menu"
            class="absolute top-full right-0 z-20 mt-1 w-40 overflow-hidden rounded-2xl border border-ink-100 bg-white py-1 shadow-lift dark:border-ink-800 dark:bg-ink-900"
          >
            <button type="button" role="menuitem" class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-800" @click="toggleLock">
              <component :is="locked ? LockOpen : Lock" class="size-4" />{{ locked ? '解鎖' : '鎖定' }}
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              @click="removeSession"
            >
              <Trash2 class="size-4" />刪除場次
            </button>
          </div>
        </div>
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

      <div v-if="!expenses.length" class="card">
        <EmptyState :icon="Receipt" title="這場還沒記費用" description="按「編輯」填上總金額和誰付的，就會自動算好每人要付多少">
          <button type="button" class="btn-primary" :disabled="locked" @click="showEdit = true"><Pencil class="size-4" />編輯</button>
        </EmptyState>
      </div>

      <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
        <section class="card overflow-hidden lg:col-span-3">
          <div class="px-5 pt-5 pb-3">
            <h2 class="text-lg font-black">
              <template v-if="!rows.length">沒有人需要付錢</template>
              <template v-else-if="unpaidCount">還有 {{ unpaidCount }} 人沒付，共 <span class="num">{{ formatMoney(remaining) }}</span></template>
              <template v-else>大家都付了 🎉</template>
            </h2>
            <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">
              <template v-for="(p, i) in payers" :key="p.member.id">
                {{ i ? '、' : '' }}{{ p.member.name }} 先付了 <span class="num font-semibold">{{ formatMoney(p.advanced) }}</span>
              </template>
            </p>
          </div>
          <div
            v-if="settledBy === 'netted' && remaining > 0"
            class="mx-5 mb-3 flex gap-2 rounded-2xl bg-ball-100 p-3 text-xs text-ink-700 dark:bg-ball-400/10 dark:text-ball-200"
          >
            <Info class="mt-0.5 size-4 shrink-0" />
            這場之後全隊的帳曾經全部打平，所以這場已算清；下面沒勾的人不用再另外付。
          </div>
          <ul v-if="rows.length" class="divide-y divide-ink-100 border-t border-ink-100 dark:divide-ink-800 dark:border-ink-800">
            <li v-for="row in rows" :key="row.member.id" class="px-5 py-3">
              <div class="flex items-center gap-3">
                <MemberAvatar :name="row.member.name" :color="row.member.color" size="sm" :muted="!row.member.active" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ row.member.name }}</p>
                  <p class="text-xs text-ink-400 dark:text-ink-300">
                    應付 <span class="num font-semibold">{{ formatMoney(row.due) }}</span>
                    <template v-if="row.paid > 0 && row.paid < row.due"> · 已付 {{ formatMoney(row.paid) }}</template>
                  </p>
                </div>
                <span v-if="row.paid >= row.due" class="chip-done"><Check class="size-3" />已付</span>
                <span v-else-if="row.paid > 0" class="chip-open">付了一部分</span>
                <span v-else class="chip-muted">還沒付</span>
              </div>
              <div class="mt-2 space-y-2 pl-11">
                <div v-for="p in row.pairs" :key="pairKey(p)" class="flex items-center gap-2">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition"
                    :class="
                      p.paid >= p.due
                        ? 'border-ball-500 bg-ball-200/60 text-ink-900 dark:border-ball-400/50 dark:bg-ball-400/10 dark:text-ball-200'
                        : p.paid > 0
                          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200'
                          : 'border-ink-200 hover:border-ink-400 dark:border-ink-700'
                    "
                    :aria-pressed="p.paid >= p.due"
                    :disabled="busyPair === pairKey(p)"
                    @click="togglePair(p)"
                  >
                    <span class="flex min-w-0 items-center gap-1.5">
                      <CircleCheck v-if="p.paid >= p.due" class="size-4 shrink-0" />
                      <Circle v-else class="size-4 shrink-0 text-ink-300" />
                      <span class="truncate">已付給 {{ ledger.idx.member(p.payer_id).name }}</span>
                    </span>
                    <span class="num shrink-0">{{ formatMoney(p.due) }}</span>
                  </button>
                  <button v-if="p.paid < p.due" type="button" class="btn-ghost shrink-0 !px-2.5 !py-2 text-xs" @click="partial(p)">
                    付一部分
                  </button>
                </div>
              </div>
            </li>
          </ul>
          <p v-if="rows.length" class="border-t border-ink-100 px-5 py-3 text-xs text-ink-400 dark:border-ink-800">
            按「已付給…」打勾，再按一次取消
          </p>
        </section>

        <section class="card p-5 lg:col-span-2">
          <h2 class="section-title mb-3">明細</h2>
          <ul class="space-y-3">
            <li v-for="e in expenses" :key="e.id" class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-semibold">{{ e.label }}</p>
                <p class="text-xs text-ink-400 dark:text-ink-300">
                  {{ expenseInfo(e).payer.name }} 付的 · {{ expenseInfo(e).count }} 人分，每人 {{ formatMoney(expenseInfo(e).perHead) }}
                  <template v-if="expenseInfo(e).surplus > 0">（除不盡進位，{{ expenseInfo(e).payer.name }} 多收 {{ formatMoney(expenseInfo(e).surplus) }}）</template>
                </p>
              </div>
              <span class="num shrink-0 font-bold">{{ formatMoney(e.amount) }}</span>
            </li>
          </ul>
          <div class="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3 text-sm dark:border-ink-800">
            <span class="text-ink-400">總金額</span>
            <span class="num font-black">{{ formatMoney(totals.total) }}</span>
          </div>
          <h3 class="section-title mt-5 mb-2">{{ isFee ? '分攤的人' : '出席' }}（{{ attendees.length }}）</h3>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="m in attendees" :key="m.id" class="chip-muted !py-1 !pl-1">
              <MemberAvatar :name="m.name" :color="m.color" size="xs" :muted="!m.active" />{{ m.name }}
            </span>
          </div>
        </section>
      </div>

      <SessionFormModal :open="showEdit" :session="session" @close="showEdit = false" @saved="showEdit = false" />
      <PaymentModal :open="!!paymentPreset" :preset="paymentPreset" @close="paymentPreset = null" />
    </template>
  </div>
</template>
