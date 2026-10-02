<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ChevronRight, PiggyBank, Plus, SearchX } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import PaymentModal from '@/components/PaymentModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { useWhoAmI } from '@/composables/useWhoAmI'
import { guestLabel, walletCredit, walletHistory, walletsOf } from '@/lib/ledger'
import { formatDate, formatMoney, toYmd } from '@/lib/format'
import type { WalletEntry } from '@/lib/balance'
import type { PaymentPreset } from '@/types'

const ledger = useLedgerReady()
const me = useWhoAmI()
const route = useRoute()
const router = useRouter()

const memberId = computed(() => String(route.params.id))
const member = computed(() => ledger.idx.members.get(memberId.value))
const list = computed(() => walletsOf(ledger.summary.wallets, memberId.value))
const wallet = computed(
  () =>
    list.value.find((w) => w.holder === route.query.holder) ??
    list.value.find((w) => walletCredit(w) > 0) ??
    list.value[0],
)
const holder = computed(() => (wallet.value ? ledger.idx.member(wallet.value.holder) : null))
const back = computed(() => (memberId.value === me.value ? '/' : `/members/${memberId.value}`))

interface Row {
  key: string
  date: string
  label: string
  note: string
  delta: number
  balance: number
  /** 這筆之後不足的金額，或這筆先補掉的舊欠款 */
  shortfall: number
  repaid: number
  link: string | null
}

function describe(e: WalletEntry): { label: string; note: string; link: string | null } {
  if (e.sessionId && e.kind === 'session') {
    const s = ledger.idx.sessions.get(e.sessionId)
    const g = ledger.data.guests.find((x) => x.session_id === e.sessionId && x.member_id === memberId.value)
    const attending = ledger.data.attendances.some((a) => a.session_id === e.sessionId && a.member_id === memberId.value)
    return {
      // 左欄已有日期，標題改用運動與標題／地點，避免重複又被截斷
      label: s ? [ledger.idx.sport(s.sport_id).name, s.title ?? s.location].filter(Boolean).join(' · ') : '場次',
      note: g ? guestLabel(g, attending) : '',
      link: `/sessions/${e.sessionId}`,
    }
  }
  const p = ledger.data.payments.find((x) => x.id === e.paymentId)
  const label = e.kind === 'topup' ? '儲值' : e.kind === 'refund' ? `${holder.value?.name} 付給他` : '付款'
  return { label, note: p?.note ?? '', link: null }
}

const history = computed(() => (wallet.value ? walletHistory(wallet.value) : { opening: 0, entries: [] }))
const rows = computed<Row[]>(() => {
  const { opening, entries } = history.value
  return entries
    .map((e, i) => {
      const before = i ? entries[i - 1].balance : opening
      return {
        key: `${e.kind}:${e.sessionId ?? ''}:${e.paymentId ?? ''}:${i}`,
        date: formatDate(toYmd(new Date(e.at))),
        ...describe(e),
        delta: e.delta,
        balance: e.balance,
        shortfall: Math.max(0, -e.balance),
        repaid: e.delta > 0 && before < 0 ? Math.min(e.delta, -before) : 0,
      }
    })
    .reverse()
})

const topup = ref<PaymentPreset | null>(null)
function recordTopup() {
  if (!member.value) return
  topup.value = { from: member.value.id, kind: 'topup', fixedParties: true, title: `${member.value.name} 儲值給你` }
}
</script>

<template>
  <div>
    <SkeletonList v-if="!ledger.loaded" />

    <EmptyState v-else-if="!member" :icon="SearchX" title="找不到這位成員">
      <RouterLink to="/" class="btn-primary">回首頁</RouterLink>
    </EmptyState>

    <template v-else>
      <PageHeader :title="`${member.name} 的儲值紀錄`" :back="back" />

      <div v-if="!wallet" class="card">
        <EmptyState :icon="PiggyBank" title="還沒有儲值紀錄" description="儲值後由保管人在「我保管的儲值」記錄" />
      </div>

      <template v-else>
        <div v-if="list.length > 1" class="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="保管人">
          <button
            v-for="w in list"
            :key="w.holder"
            type="button"
            role="tab"
            :aria-selected="w === wallet"
            class="flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm font-semibold transition"
            :class="
              w === wallet
                ? 'border-ink-900 bg-ink-900 text-white dark:border-ball-400 dark:bg-ball-400 dark:text-ink-950'
                : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-300'
            "
            @click="router.replace({ query: { holder: w.holder } })"
          >
            <MemberAvatar :name="ledger.idx.member(w.holder).name" :color="ledger.idx.member(w.holder).color" size="xs" />
            {{ ledger.idx.member(w.holder).name }}
          </button>
        </div>

        <section class="card mb-6 flex flex-wrap items-end justify-between gap-4 p-5">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-ink-400 dark:text-ink-300">保管人：{{ holder?.name }}</p>
            <p class="num mt-1 text-4xl font-black tracking-tight">{{ formatMoney(walletCredit(wallet)) }}</p>
            <p v-if="wallet.balance < 0" class="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-400">
              不足 {{ formatMoney(-wallet.balance) }}，已轉為欠 {{ holder?.name }} 的錢
            </p>
          </div>
          <button v-if="me && me === wallet.holder" type="button" class="btn-primary" @click="recordTopup">
            <Plus class="size-4" />記錄儲值
          </button>
        </section>

        <h2 class="section-title mb-3">紀錄</h2>
        <ul class="card divide-y divide-ink-100 overflow-hidden dark:divide-ink-800">
          <li v-for="r in rows" :key="r.key">
            <component
              :is="r.link ? RouterLink : 'div'"
              :to="r.link ?? undefined"
              class="flex items-start gap-3 px-4 py-3"
              :class="r.link && 'transition hover:bg-ink-50 dark:hover:bg-ink-800/60'"
            >
              <span class="num w-12 shrink-0 pt-0.5 text-xs text-ink-400 dark:text-ink-300">{{ r.date }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">{{ r.label }}</p>
                <p v-if="r.note" class="truncate text-xs text-ink-400 dark:text-ink-300">{{ r.note }}</p>
                <p v-if="r.shortfall" class="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  不足 {{ formatMoney(r.shortfall) }}，轉為欠款
                </p>
                <p v-else-if="r.repaid" class="text-xs text-ink-400 dark:text-ink-300">先補欠款 {{ formatMoney(r.repaid) }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="num font-bold" :class="r.delta > 0 ? 'text-ball-700 dark:text-ball-400' : ''">
                  {{ r.delta > 0 ? '+' : '−' }}{{ formatMoney(Math.abs(r.delta)) }}
                </p>
                <p class="num text-xs text-ink-400 dark:text-ink-300">餘額 {{ formatMoney(Math.max(0, r.balance)) }}</p>
              </div>
              <ChevronRight v-if="r.link" class="mt-0.5 size-4 shrink-0 text-ink-300" />
            </component>
          </li>
          <li v-if="history.opening" class="flex items-start gap-3 px-4 py-3">
            <span class="w-12 shrink-0" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold">儲值前的帳</p>
              <p class="text-xs text-ink-400 dark:text-ink-300">
                {{
                  history.opening < 0
                    ? `當時欠 ${holder?.name} ${formatMoney(-history.opening)}，儲值時先抵掉`
                    : `當時 ${holder?.name} 欠他 ${formatMoney(history.opening)}，併入儲值`
                }}
              </p>
            </div>
            <p class="num shrink-0 font-bold" :class="history.opening > 0 ? 'text-ball-700 dark:text-ball-400' : ''">
              {{ history.opening > 0 ? '+' : '−' }}{{ formatMoney(Math.abs(history.opening)) }}
            </p>
          </li>
        </ul>
      </template>
    </template>

    <PaymentModal :open="!!topup" :preset="topup" @close="topup = null" />
  </div>
</template>
