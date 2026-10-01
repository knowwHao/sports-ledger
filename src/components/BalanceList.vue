<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import type { Id, Member } from '@/types'
import { formatMoney } from '@/lib/format'

const props = defineProps<{
  members: Member[]
  balances: Map<Id, number>
  /** 有傳就讓每列可點 */
  linkTo?: (m: Member) => string
  highlightId?: Id | null
  hideZero?: boolean
}>()

const rows = computed(() =>
  props.members
    .map((m) => ({ member: m, balance: props.balances.get(m.id) ?? 0 }))
    .filter((r) => !props.hideZero || r.balance !== 0 || r.member.id === props.highlightId)
    .sort((a, b) => {
      if (a.member.id === props.highlightId) return -1
      if (b.member.id === props.highlightId) return 1
      return a.balance - b.balance
    }),
)
const max = computed(() => Math.max(1, ...rows.value.map((r) => Math.abs(r.balance))))
</script>

<template>
  <ul class="divide-y divide-ink-100 dark:divide-ink-800">
    <li v-for="r in rows" :key="r.member.id">
      <component
        :is="linkTo ? 'RouterLink' : 'div'"
        :to="linkTo?.(r.member)"
        class="flex items-center gap-3 px-4 py-3"
        :class="[
          linkTo && 'transition hover:bg-ink-50 dark:hover:bg-ink-800/60',
          r.member.id === highlightId && 'bg-ball-100/70 dark:bg-ball-400/10',
        ]"
      >
        <MemberAvatar :name="r.member.name" :color="r.member.color" size="sm" :muted="!r.member.active" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate font-semibold">
              {{ r.member.name }}
              <span v-if="r.member.id === highlightId" class="chip-done ml-1 !py-0 align-middle">我</span>
            </p>
            <p
              class="num shrink-0 font-bold"
              :class="r.balance < 0 ? 'text-rose-600 dark:text-rose-400' : r.balance > 0 ? 'text-ball-700 dark:text-ball-400' : 'text-ink-300'"
            >
              {{ r.balance > 0 ? '+' : r.balance < 0 ? '−' : '' }}{{ formatMoney(Math.abs(r.balance)) }}
            </p>
          </div>
          <div class="mt-1.5 flex h-1.5 items-center">
            <div class="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-ink-100 dark:bg-ink-800">
              <div v-if="r.balance < 0" class="h-full rounded-l-full bg-rose-400" :style="{ width: `${(-r.balance / max) * 100}%` }" />
            </div>
            <div class="h-3 w-px bg-ink-300 dark:bg-ink-600" />
            <div class="flex h-full flex-1 overflow-hidden rounded-r-full bg-ink-100 dark:bg-ink-800">
              <div v-if="r.balance > 0" class="h-full rounded-r-full bg-ball-500" :style="{ width: `${(r.balance / max) * 100}%` }" />
            </div>
          </div>
        </div>
        <ChevronRight v-if="linkTo" class="size-4 shrink-0 text-ink-300" />
      </component>
    </li>
  </ul>
</template>
