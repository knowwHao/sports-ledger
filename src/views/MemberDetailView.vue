<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarX, ReceiptText, SearchX } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import TransferList from '@/components/TransferList.vue'
import TransferModal from '@/components/TransferModal.vue'
import PaymentList from '@/components/PaymentList.vue'
import MemberSessions from '@/components/MemberSessions.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { memberAdvanced, memberLines, memberPayments } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'
import type { PairCoverage, Transfer } from '@/lib/balance'
import type { Payment } from '@/types'

const ledger = useLedgerReady()
const route = useRoute()
const router = useRouter()

const memberId = computed(() => String(route.params.id))
const member = computed(() => ledger.idx.members.get(memberId.value))
const balance = computed(() => ledger.summary.balances.get(memberId.value) ?? 0)
const transfers = computed(() =>
  ledger.summary.transfers.filter((t) => t.from === memberId.value || t.to === memberId.value),
)
const payments = computed(() => memberPayments(ledger.data, memberId.value))
const lines = computed(() => memberLines(ledger.data, memberId.value))
const totalDue = computed(() => lines.value.reduce((s, l) => s + l.share.amount_due, 0))
const advanced = computed(() => memberAdvanced(ledger.data, memberId.value))
const busy = ref<string | null>(null)
const confirming = ref<Transfer | null>(null)
const sessionOf = (id: string) => ledger.idx.sessions.get(id)

async function pay(p: PairCoverage, sessionId: string) {
  busy.value = `${sessionId}:${p.payer_id}`
  try {
    await ledger.payDirect(sessionId, p.member_id, p.payer_id, p.due - p.paid)
    toast.success(`已記錄付給 ${ledger.idx.member(p.payer_id).name} ${formatMoney(p.due - p.paid)}`)
  } catch (e) {
    toast.error(`記錄失敗：${errorMessage(e)}`)
  } finally {
    busy.value = null
  }
}

async function removePayment(p: Payment) {
  const ok = await confirmDialog({
    title: '刪除這筆付款紀錄？',
    message: `${ledger.idx.member(p.from_member_id).name} → ${ledger.idx.member(p.to_member_id).name} ${formatMoney(p.amount)}`,
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
    <SkeletonList v-if="!ledger.loaded" />

    <EmptyState v-else-if="!member" :icon="SearchX" title="找不到這位成員">
      <RouterLink to="/team" class="btn-primary">回全隊</RouterLink>
    </EmptyState>

    <template v-else>
      <PageHeader :title="member.name" back="/team" :subtitle="member.active ? undefined : '已封存'" />

      <section class="card mb-6 flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <MemberAvatar :name="member.name" :color="member.color" size="lg" :muted="!member.active" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-ink-400">{{ balance < 0 ? '要付' : balance > 0 ? '要收' : '目前' }}</p>
          <p
            class="num text-4xl font-black tracking-tight"
            :class="balance < 0 ? 'text-rose-600 dark:text-rose-400' : balance > 0 ? 'text-ball-700 dark:text-ball-400' : ''"
          >
            {{ balance === 0 ? '兩清' : formatMoney(Math.abs(balance)) }}
          </p>
          <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">
            {{ balance < 0 ? '還要轉錢給別人' : balance > 0 ? '別人還要轉錢給他' : '沒有待結清的帳' }}
          </p>
        </div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt class="text-ink-400">累計先付</dt>
          <dd class="num text-right font-semibold">{{ formatMoney(advanced) }}</dd>
          <dt class="text-ink-400">累計應付</dt>
          <dd class="num text-right font-semibold">{{ formatMoney(totalDue) }}</dd>
        </dl>
      </section>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div class="space-y-6 lg:col-span-3">
          <section>
            <h2 class="section-title mb-3">參與的場次</h2>
            <MemberSessions
              v-if="lines.length"
              :data="ledger.data"
              :member-id="member.id"
              :settlements="ledger.summary.settlements"
              :busy="busy"
              actionable
              @pay="pay"
              @open="(id) => router.push(`/sessions/${id}`)"
            />
            <div v-else class="card"><EmptyState :icon="CalendarX" title="還沒有參與任何分攤" /></div>
          </section>
        </div>
        <div class="space-y-6 lg:col-span-2">
          <section v-if="transfers.length">
            <h2 class="section-title mb-3">他的轉帳建議</h2>
            <div class="card overflow-hidden">
              <TransferList :transfers="transfers" :member="ledger.idx.member" actionable @record="(t) => (confirming = t)" />
            </div>
          </section>
          <section>
            <h2 class="section-title mb-3">付款紀錄</h2>
            <div class="card overflow-hidden">
              <PaymentList
                v-if="payments.length"
                :payments="payments"
                :member="ledger.idx.member"
                :session="sessionOf"
                deletable
                @remove="removePayment"
              />
              <EmptyState v-else :icon="ReceiptText" title="沒有付款紀錄" />
            </div>
          </section>
        </div>
      </div>
      <TransferModal :transfer="confirming" @close="confirming = null" />
    </template>
  </div>
</template>
