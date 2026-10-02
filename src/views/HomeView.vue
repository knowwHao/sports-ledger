<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ArrowRight, CalendarPlus, ChevronRight, PiggyBank, Plus, Users } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import SessionStatusChip from '@/components/SessionStatusChip.vue'
import SessionFormModal from '@/components/SessionFormModal.vue'
import TransferModal from '@/components/TransferModal.vue'
import PaymentModal from '@/components/PaymentModal.vue'
import WalletCard from '@/components/WalletCard.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { askLogin, useWhoAmI } from '@/composables/useWhoAmI'
import { sessionTotals, walletCredit, walletsHeldBy, walletsOf } from '@/lib/ledger'
import { formatDate, formatMoney, sessionTitle } from '@/lib/format'
import type { Transfer } from '@/lib/balance'
import type { PaymentPreset, Session } from '@/types'

const ledger = useLedgerReady()
const me = useWhoAmI()
const router = useRouter()

const showForm = ref(false)
const confirming = ref<Transfer | null>(null)
const topup = ref<PaymentPreset | null>(null)

const meMember = computed(() => ledger.activeMembers.find((m) => m.id === me.value) ?? null)
const balance = computed(() => (meMember.value ? (ledger.summary.balances.get(meMember.value.id) ?? 0) : 0))
const toPay = computed(() => ledger.summary.transfers.filter((t) => t.from === meMember.value?.id))
const toReceive = computed(() => ledger.summary.transfers.filter((t) => t.to === meMember.value?.id))
const recent = computed(() => ledger.sessions.slice(0, 5))
const myWallets = computed(() => (meMember.value ? walletsOf(ledger.summary.wallets, meMember.value.id) : []))
const held = computed(() => (meMember.value ? walletsHeldBy(ledger.summary.wallets, meMember.value.id) : []))
const heldTotal = computed(() => held.value.reduce((s, w) => s + walletCredit(w), 0))

function sessionLine(s: Session) {
  const sport = ledger.idx.sport(s.sport_id)
  const when = s.play_date ? formatDate(s.play_date) : sessionTitle(s)
  const where = s.play_date ? (s.title ?? s.location ?? sport.name) : sport.name
  return { sport, when, where, total: sessionTotals(ledger.data, s.id).total }
}

function onCreated(id: string) {
  showForm.value = false
  router.push(`/sessions/${id}`)
}
</script>

<template>
  <div>
    <SkeletonList v-if="!ledger.loaded" :rows="4" />

    <EmptyState
      v-else-if="!ledger.activeMembers.length"
      :icon="Users"
      title="先把球友加進來"
      description="建立成員名冊後，就能開始記錄每一場的費用"
    >
      <RouterLink to="/members" class="btn-primary">新增成員</RouterLink>
    </EmptyState>

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
      <div class="space-y-4 lg:col-span-3">
        <section v-if="!meMember" class="card p-5">
          <h1 class="text-lg font-black">你是哪一位？</h1>
          <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">點自己的名字並輸入密碼，這裡會直接告訴你要轉給誰、誰要轉給你</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="m in ledger.activeMembers"
              :key="m.id"
              type="button"
              class="flex items-center gap-1.5 rounded-full border border-ink-200 py-1 pr-3 pl-1 text-sm font-semibold transition hover:border-ink-400 dark:border-ink-700"
              @click="askLogin(m.id)"
            >
              <MemberAvatar :name="m.name" :color="m.color" size="xs" />{{ m.name }}
            </button>
          </div>
        </section>

        <WalletCard
          v-if="meMember"
          :member-id="meMember.id"
          :wallets="myWallets"
          :member="ledger.idx.member"
          @topup="topup = { kind: 'topup' }"
        />

        <section
          v-if="meMember"
          class="relative overflow-clip rounded-[2rem] bg-ink-900 p-6 text-white shadow-lift sm:p-7 dark:bg-ink-800"
        >
          <div class="absolute -top-16 -right-10 size-48 rounded-full bg-ball-400/25 blur-3xl" aria-hidden="true" />
          <div class="relative">
            <h1 class="text-sm font-semibold text-ink-200">{{ balance !== 0 ? `${meMember.name}，你目前` : `嗨，${meMember.name}` }}</h1>
            <template v-if="balance !== 0">
              <p class="mt-1 flex items-baseline gap-2">
                <span class="text-lg font-bold">{{ balance < 0 ? '要付' : '要收' }}</span>
                <span class="num text-5xl font-black tracking-tight text-ball-400">{{ formatMoney(Math.abs(balance)) }}</span>
              </p>
              <ul class="mt-4 divide-y divide-white/10">
                <li v-for="t in toPay" :key="t.to" class="flex items-center gap-3 py-2.5">
                  <ArrowRight class="size-4 shrink-0 text-ink-300" />
                  <MemberAvatar :name="ledger.idx.member(t.to).name" :color="ledger.idx.member(t.to).color" size="sm" />
                  <span class="min-w-0 flex-1 truncate font-semibold">{{ ledger.idx.member(t.to).name }}</span>
                  <span class="num font-black">{{ formatMoney(t.amount) }}</span>
                </li>
                <li v-for="t in toReceive" :key="t.from" class="flex items-center gap-3 py-2.5">
                  <MemberAvatar :name="ledger.idx.member(t.from).name" :color="ledger.idx.member(t.from).color" size="sm" />
                  <span class="min-w-0 flex-1 truncate">
                    <span class="font-semibold">{{ ledger.idx.member(t.from).name }}</span>
                    <span class="text-sm text-ink-300"> 會轉給你</span>
                  </span>
                  <span class="num font-black">{{ formatMoney(t.amount) }}</span>
                  <button
                    type="button"
                    class="btn !border !border-white/20 !px-3 !py-1.5 text-xs text-white hover:bg-white/10"
                    @click="confirming = t"
                  >
                    已收到
                  </button>
                </li>
              </ul>
              <p v-if="toPay.length" class="mt-3 text-xs text-ink-300">轉帳後請對方按「已收到」，帳才會更新</p>
            </template>
            <p v-else class="mt-2 text-2xl font-black">你目前沒有待結清的帳 🎉</p>
          </div>
        </section>

        <RouterLink
          v-if="meMember && held.length"
          :to="`/members/${meMember.id}/held`"
          class="card flex items-center gap-3 p-4 transition hover:bg-ink-50 dark:hover:bg-ink-800/60"
        >
          <span class="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ball-200/70 text-ink-900 dark:bg-ball-400/15 dark:text-ball-200">
            <PiggyBank class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold">我保管的儲值</p>
            <p class="text-xs text-ink-400 dark:text-ink-300">{{ held.length }} 人儲值在你這裡，是大家的錢、不是要收的錢</p>
          </div>
          <span class="num shrink-0 font-black">{{ formatMoney(heldTotal) }}</span>
          <ChevronRight class="size-4 shrink-0 text-ink-300" />
        </RouterLink>

        <button type="button" class="btn-primary w-full !py-3.5 text-base" @click="showForm = true">
          <Plus class="size-5" />記一場
        </button>
      </div>

      <section class="lg:col-span-2">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="section-title">最近場次</h2>
          <RouterLink to="/sessions" class="text-sm font-semibold text-ink-400 hover:text-ink-700 dark:hover:text-ink-100">全部</RouterLink>
        </div>
        <div v-if="recent.length" class="card overflow-hidden">
          <ul class="divide-y divide-ink-100 dark:divide-ink-800">
            <li v-for="s in recent" :key="s.id">
              <RouterLink :to="`/sessions/${s.id}`" class="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/60">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-2xl text-xl"
                  :style="{ backgroundColor: `${sessionLine(s).sport.color}33` }"
                  aria-hidden="true"
                  >{{ sessionLine(s).sport.emoji }}</span
                >
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ sessionLine(s).when }}</p>
                  <p class="truncate text-xs text-ink-400 dark:text-ink-300">{{ sessionLine(s).where }}</p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="num font-bold">{{ formatMoney(sessionLine(s).total) }}</p>
                  <SessionStatusChip :session-id="s.id" />
                </div>
              </RouterLink>
            </li>
          </ul>
        </div>
        <div v-else class="card">
          <EmptyState :icon="CalendarPlus" title="還沒有任何場次" description="打完球按「記一場」，自動算好每個人要付多少" />
        </div>
        <RouterLink
          to="/team"
          class="mt-4 flex items-center justify-end gap-1 text-sm font-semibold text-ink-500 hover:text-ink-800 dark:text-ink-300 dark:hover:text-ink-100"
        >
          查看結餘總覽<ChevronRight class="size-4" />
        </RouterLink>
      </section>
    </div>

    <SessionFormModal :open="showForm" @close="showForm = false" @saved="onCreated" />
    <TransferModal :transfer="confirming" @close="confirming = null" />
    <PaymentModal :open="!!topup" :preset="topup" @close="topup = null" />
  </div>
</template>
