<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ChevronRight, PiggyBank, Plus, SearchX } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import PaymentModal from '@/components/PaymentModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { useWhoAmI } from '@/composables/useWhoAmI'
import { walletCredit, walletsHeldBy } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'
import type { PaymentPreset } from '@/types'

const ledger = useLedgerReady()
const me = useWhoAmI()
const route = useRoute()

const holderId = computed(() => String(route.params.id))
const holder = computed(() => ledger.idx.members.get(holderId.value))
const isMe = computed(() => !!me.value && me.value === holderId.value)
const order = computed(() => new Map(ledger.members.map((m, i) => [m.id, i])))
const list = computed(() =>
  walletsHeldBy(ledger.summary.wallets, holderId.value).sort(
    (a, b) => (order.value.get(a.member) ?? 0) - (order.value.get(b.member) ?? 0),
  ),
)
const total = computed(() => list.value.reduce((s, w) => s + walletCredit(w), 0))
const back = computed(() => (isMe.value ? '/' : `/members/${holderId.value}`))

const topup = ref<PaymentPreset | null>(null)
</script>

<template>
  <div>
    <SkeletonList v-if="!ledger.loaded" />

    <EmptyState v-else-if="!holder" :icon="SearchX" title="找不到這位成員">
      <RouterLink to="/" class="btn-primary">回首頁</RouterLink>
    </EmptyState>

    <template v-else>
      <PageHeader :title="isMe ? '我保管的儲值' : `${holder.name} 保管的儲值`" :back="back" />

      <section class="card mb-6 flex flex-wrap items-end justify-between gap-4 p-5">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-ink-400 dark:text-ink-300">合計 · {{ list.length }} 人</p>
          <p class="num mt-1 text-4xl font-black tracking-tight">{{ formatMoney(total) }}</p>
          <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">大家先放在這裡的錢，不算要付或要收；墊付的場次會自動從裡面扣</p>
        </div>
        <button v-if="isMe" type="button" class="btn-primary" @click="topup = { kind: 'topup' }">
          <Plus class="size-4" />記錄儲值
        </button>
      </section>

      <ul v-if="list.length" class="card divide-y divide-ink-100 overflow-hidden dark:divide-ink-800">
        <li v-for="w in list" :key="w.member">
          <RouterLink
            :to="{ path: `/members/${w.member}/wallet`, query: { holder: holderId } }"
            class="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/60"
          >
            <MemberAvatar :name="ledger.idx.member(w.member).name" :color="ledger.idx.member(w.member).color" size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">{{ ledger.idx.member(w.member).name }}</p>
              <p v-if="w.balance < 0" class="text-xs font-semibold text-rose-600 dark:text-rose-400">
                不足 {{ formatMoney(-w.balance) }}，轉為欠款
              </p>
            </div>
            <span class="num shrink-0 font-black">{{ formatMoney(walletCredit(w)) }}</span>
            <ChevronRight class="size-4 shrink-0 text-ink-300" />
          </RouterLink>
        </li>
      </ul>
      <div v-else class="card">
        <EmptyState :icon="PiggyBank" title="還沒有人儲值" description="收到儲值後按「記錄儲值」，之後你墊付的場次會自動從裡面扣" />
      </div>
    </template>

    <PaymentModal :open="!!topup" :preset="topup" @close="topup = null" />
  </div>
</template>
