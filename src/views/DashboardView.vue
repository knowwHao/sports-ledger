<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CalendarPlus, HandCoins, PartyPopper, Plus, ReceiptText, Users } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import OutstandingHero from '@/components/OutstandingHero.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import SessionCard from '@/components/SessionCard.vue'
import SportFilter from '@/components/SportFilter.vue'
import BalanceList from '@/components/BalanceList.vue'
import TransferList from '@/components/TransferList.vue'
import PaymentList from '@/components/PaymentList.vue'
import PaymentModal from '@/components/PaymentModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { sortedPayments, sessionTotals } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'
import type { Transfer } from '@/lib/balance'
import type { Member, Payment } from '@/types'

const ledger = useLedgerReady()

const sport = ref('all')
const busy = ref<string | null>(null)
const showPayment = ref(false)
const showAllPayments = ref(false)

const summary = computed(() => ledger.summary)
const balanceMembers = computed(() =>
  ledger.members.filter((m) => m.active || (summary.value.balances.get(m.id) ?? 0) !== 0),
)
const payments = computed(() => sortedPayments(ledger.data.payments))
const shownPayments = computed(() => (showAllPayments.value ? payments.value : payments.value.slice(0, 5)))

const sportSessions = computed(() =>
  ledger.sessions.filter((s) => sport.value === 'all' || (s.sport_id ?? '') === sport.value),
)
const sportSpend = computed(() => sportSessions.value.reduce((sum, s) => sum + sessionTotals(ledger.data, s.id).total, 0))
const openCount = computed(() => sportSessions.value.filter((s) => summary.value.statuses.get(s.id) === 'open').length)

const caption = computed(() =>
  summary.value.transfers.length
    ? `只要 ${summary.value.transfers.length} 筆轉帳就能讓全隊結清`
    : '目前全隊餘額皆為 0，沒有人需要轉帳',
)

const memberLink = (m: Member) => `/members/${m.id}`
const sessionOf = (id: string) => ledger.idx.sessions.get(id)

async function record(t: Transfer) {
  busy.value = `${t.from}>${t.to}`
  try {
    await ledger.recordTransfer(t)
    toast.success(`已記錄 ${ledger.idx.member(t.from).name} → ${ledger.idx.member(t.to).name} ${formatMoney(t.amount)}`)
  } catch (e) {
    toast.error(`記錄失敗：${errorMessage(e)}`)
  } finally {
    busy.value = null
  }
}

async function removePayment(p: Payment) {
  const ok = await confirmDialog({
    title: '刪除這筆付款紀錄？',
    message: `${ledger.idx.member(p.from_member_id).name} → ${ledger.idx.member(p.to_member_id).name} ${formatMoney(p.amount)}，刪除後雙方餘額會還原。`,
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  try {
    await ledger.deletePayments([p.id])
    toast.success('已刪除付款紀錄')
  } catch (e) {
    toast.error(`刪除失敗：${errorMessage(e)}`)
  }
}
</script>

<template>
  <div>
    <PageHeader title="總覽" subtitle="跨運動合併計算，誰該付誰一眼看清楚">
      <RouterLink to="/sessions?new=1" class="btn-primary hidden sm:inline-flex">
        <CalendarPlus class="size-4" />新增場次
      </RouterLink>
    </PageHeader>

    <SkeletonList v-if="!ledger.loaded" :rows="5" />

    <EmptyState
      v-else-if="!ledger.members.length"
      :icon="Users"
      title="先把球友加進來"
      description="建立成員名冊後，就能開始記錄每一場的費用與分攤"
    >
      <RouterLink to="/members" class="btn-primary">前往成員管理</RouterLink>
    </EmptyState>

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div class="space-y-6 lg:col-span-3">
        <OutstandingHero :total="summary.outstanding" label="全隊待轉帳總額" :caption="caption" />

        <section>
          <h2 class="section-title mb-3">結算建議</h2>
          <div class="card overflow-hidden">
            <TransferList
              v-if="summary.transfers.length"
              :transfers="summary.transfers"
              :member="ledger.idx.member"
              :busy="busy"
              actionable
              @record="record"
            />
            <EmptyState v-else :icon="PartyPopper" title="全隊都結清了" description="沒有任何需要轉帳的款項" />
          </div>
          <p v-if="summary.transfers.length" class="mt-2 px-1 text-xs text-ink-400">
            已把所有欠款互相抵銷，照這份清單轉帳後全隊餘額歸零
          </p>
        </section>

        <section>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="section-title">最近場次</h2>
            <RouterLink to="/sessions" class="text-sm font-semibold text-ink-400 hover:text-ink-700 dark:hover:text-ink-100">
              全部場次
            </RouterLink>
          </div>
          <SportFilter v-model="sport" class="mb-3" />
          <p v-if="sportSessions.length" class="mb-3 px-1 text-xs text-ink-400 dark:text-ink-300">
            累計 <span class="num font-bold">{{ sportSessions.length }}</span> 場 · 總支出
            <span class="num font-bold">{{ formatMoney(sportSpend) }}</span> ·
            <span class="num font-bold">{{ openCount }}</span> 場未結清
          </p>
          <div v-if="sportSessions.length" class="space-y-3">
            <SessionCard v-for="s in sportSessions.slice(0, 4)" :key="s.id" :session="s" />
          </div>
          <div v-else class="card">
            <EmptyState :icon="CalendarPlus" title="還沒有任何場次" description="打完球記一筆，系統會自動算好每個人要付多少">
              <RouterLink to="/sessions?new=1" class="btn-primary">新增場次</RouterLink>
            </EmptyState>
          </div>
        </section>
      </div>

      <div class="space-y-6 lg:col-span-2">
        <section>
          <h2 class="section-title mb-3">每人淨餘額</h2>
          <div class="card overflow-hidden">
            <BalanceList :members="balanceMembers" :balances="summary.balances" :link-to="memberLink" />
          </div>
          <p class="mt-2 px-1 text-xs text-ink-400">正數＝別人欠他（應收），負數＝他欠別人（應付）</p>
        </section>

        <section>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="section-title">付款紀錄</h2>
            <button type="button" class="btn-ghost !px-3 !py-1.5 text-xs" @click="showPayment = true">
              <Plus class="size-3.5" />新增付款
            </button>
          </div>
          <div class="card overflow-hidden">
            <template v-if="payments.length">
              <PaymentList
                :payments="shownPayments"
                :member="ledger.idx.member"
                :session="sessionOf"
                deletable
                @remove="removePayment"
              />
              <button
                v-if="payments.length > 5"
                type="button"
                class="w-full border-t border-ink-100 py-3 text-sm font-semibold text-ink-400 hover:text-ink-700 dark:border-ink-800 dark:hover:text-ink-100"
                @click="showAllPayments = !showAllPayments"
              >
                {{ showAllPayments ? '收合' : `顯示全部 ${payments.length} 筆` }}
              </button>
            </template>
            <EmptyState v-else :icon="ReceiptText" title="還沒有付款紀錄" description="在場次頁按「已付」或在上方記錄結算轉帳" />
          </div>
        </section>

        <section v-if="!summary.transfers.length && ledger.sessions.length" class="card flex items-center gap-3 p-4">
          <HandCoins class="size-5 text-ball-600" />
          <p class="text-sm text-ink-500 dark:text-ink-300">所有場次都已結清或互相抵銷完畢。</p>
        </section>
      </div>
    </div>

    <PaymentModal :open="showPayment" @close="showPayment = false" />
  </div>
</template>
