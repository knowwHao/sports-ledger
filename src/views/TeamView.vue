<script setup lang="ts">
import { computed, ref } from 'vue'
import { PartyPopper, Plus, ReceiptText, Users } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import OutstandingHero from '@/components/OutstandingHero.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import BalanceList from '@/components/BalanceList.vue'
import TransferList from '@/components/TransferList.vue'
import TransferModal from '@/components/TransferModal.vue'
import PaymentList from '@/components/PaymentList.vue'
import PaymentModal from '@/components/PaymentModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { useWhoAmI } from '@/composables/useWhoAmI'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { sortedPayments } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'
import type { Transfer } from '@/lib/balance'
import type { Member, Payment } from '@/types'

const ledger = useLedgerReady()
const me = useWhoAmI()

const confirming = ref<Transfer | null>(null)
const showPayment = ref(false)
const showAllPayments = ref(false)

const summary = computed(() => ledger.summary)
const balanceMembers = computed(() =>
  ledger.members.filter((m) => m.active || (summary.value.balances.get(m.id) ?? 0) !== 0),
)
const payments = computed(() => sortedPayments(ledger.data.payments))
const shownPayments = computed(() => (showAllPayments.value ? payments.value : payments.value.slice(0, 5)))
const caption = computed(() =>
  summary.value.transfers.length
    ? `照下面 ${summary.value.transfers.length} 筆轉帳，全隊就兩清`
    : '大家都兩清了，沒有人需要轉帳',
)

const memberLink = (m: Member) => `/members/${m.id}`
const sessionOf = (id: string) => ledger.idx.sessions.get(id)

async function removePayment(p: Payment) {
  const ok = await confirmDialog({
    title: '刪除這筆付款紀錄？',
    message: `${ledger.idx.member(p.from_member_id).name} → ${ledger.idx.member(p.to_member_id).name} ${formatMoney(p.amount)}，刪除後兩人的要付／要收會還原。`,
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
    <PageHeader title="全隊" subtitle="所有運動、所有場次合在一起算" />

    <SkeletonList v-if="!ledger.loaded" :rows="5" />

    <EmptyState
      v-else-if="!ledger.members.length"
      :icon="Users"
      title="先把球友加進來"
      description="建立成員名冊後，就能開始記錄每一場的費用"
    >
      <RouterLink to="/members" class="btn-primary">新增成員</RouterLink>
    </EmptyState>

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div class="space-y-6 lg:col-span-3">
        <OutstandingHero :total="summary.outstanding" label="全隊待轉帳總額" :caption="caption" />

        <section>
          <h2 class="section-title mb-3">轉帳建議</h2>
          <div class="card overflow-hidden">
            <TransferList
              v-if="summary.transfers.length"
              :transfers="summary.transfers"
              :member="ledger.idx.member"
              :highlight-id="me"
              actionable
              @record="(t) => (confirming = t)"
            />
            <EmptyState v-else :icon="PartyPopper" title="全隊都兩清了" description="沒有任何需要轉帳的款項" />
          </div>
          <p v-if="summary.transfers.length" class="mt-2 px-1 text-xs text-ink-400">
            已經把大家互相欠的錢抵掉，照這份清單轉帳的筆數最少
          </p>
        </section>
      </div>

      <div class="space-y-6 lg:col-span-2">
        <section>
          <h2 class="section-title mb-3">每人要付／要收</h2>
          <div class="card overflow-hidden">
            <BalanceList :members="balanceMembers" :balances="summary.balances" :link-to="memberLink" :highlight-id="me" />
          </div>
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
            <EmptyState v-else :icon="ReceiptText" title="還沒有付款紀錄" description="在場次頁按「已付給…」，或在上方按「已轉帳」" />
          </div>
        </section>
      </div>
    </div>

    <TransferModal :transfer="confirming" @close="confirming = null" />
    <PaymentModal :open="showPayment" @close="showPayment = false" />
  </div>
</template>
