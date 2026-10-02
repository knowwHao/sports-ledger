<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import type { Id, Member } from '@/types'
import type { Wallet } from '@/lib/balance'
import { walletCredit } from '@/lib/ledger'
import { formatMoney } from '@/lib/format'

const props = defineProps<{ memberId: Id; wallets: Wallet[]; member: (id: Id) => Member }>()

const total = computed(() => props.wallets.reduce((s, w) => s + walletCredit(w), 0))
// 餘額歸 0 的保管人不顯示，不足的部分在「我的帳」以欠款呈現
const holders = computed(() => props.wallets.filter((w) => walletCredit(w) > 0))
const historyLink = (holder?: Id) => ({ path: `/members/${props.memberId}/wallet`, query: holder ? { holder } : {} })
</script>

<template>
  <section class="card p-5">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-ink-400 dark:text-ink-300">儲值餘額</h2>
      <RouterLink
        :to="historyLink(holders.length === 1 ? holders[0].holder : undefined)"
        class="flex items-center text-sm font-semibold text-ink-400 hover:text-ink-700 dark:hover:text-ink-100"
      >
        儲值紀錄<ChevronRight class="size-4" />
      </RouterLink>
    </div>
    <p class="num mt-1 text-4xl font-black tracking-tight">{{ formatMoney(total) }}</p>
    <p v-if="holders.length === 1" class="mt-1 text-sm text-ink-500 dark:text-ink-300">
      保管人：{{ member(holders[0].holder).name }}
    </p>
    <ul v-else-if="holders.length > 1" class="mt-2 divide-y divide-ink-100 dark:divide-ink-800">
      <li v-for="w in holders" :key="w.holder">
        <RouterLink :to="historyLink(w.holder)" class="flex items-center gap-2 py-2 text-sm">
          <span class="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-300">保管人：{{ member(w.holder).name }}</span>
          <span class="num font-bold">{{ formatMoney(walletCredit(w)) }}</span>
          <ChevronRight class="size-4 shrink-0 text-ink-300" />
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
