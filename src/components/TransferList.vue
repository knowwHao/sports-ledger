<script setup lang="ts">
import { ArrowRight, Check } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import type { Transfer } from '@/lib/balance'
import type { Id, Member } from '@/types'
import { formatMoney } from '@/lib/format'

defineProps<{ transfers: Transfer[]; member: (id: Id) => Member; actionable?: boolean; busy?: string | null; highlightId?: Id | null }>()
const emit = defineEmits<{ record: [t: Transfer] }>()
const keyOf = (t: Transfer) => `${t.from}>${t.to}`
</script>

<template>
  <ul class="divide-y divide-ink-100 dark:divide-ink-800">
    <li
      v-for="t in transfers"
      :key="keyOf(t)"
      class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 sm:flex"
      :class="highlightId && (t.from === highlightId || t.to === highlightId) && 'bg-ball-100/70 dark:bg-ball-400/10'"
    >
      <div class="flex min-w-0 items-center gap-2 sm:flex-1">
        <MemberAvatar :name="member(t.from).name" :color="member(t.from).color" size="sm" />
        <span class="truncate font-semibold">{{ member(t.from).name }}</span>
        <ArrowRight class="size-4 shrink-0 text-ink-300" />
        <MemberAvatar :name="member(t.to).name" :color="member(t.to).color" size="sm" />
        <span class="truncate font-semibold">{{ member(t.to).name }}</span>
      </div>
      <!-- 手機版金額固定放在姓名下方，避免金額位數不同時有的列換行、有的不換 -->
      <span class="num text-lg font-black" :class="actionable ? 'row-start-2 pl-10 sm:pl-0' : 'text-right'">
        {{ formatMoney(t.amount) }}
      </span>
      <button
        v-if="actionable"
        type="button"
        class="btn-dark col-start-2 row-span-2 row-start-1 !px-3 !py-1.5 text-xs"
        :disabled="busy === keyOf(t)"
        @click="emit('record', t)"
      >
        <Check class="size-3.5" />已轉帳
      </button>
    </li>
  </ul>
</template>
