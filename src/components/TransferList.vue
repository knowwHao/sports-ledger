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
      class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
      :class="highlightId && (t.from === highlightId || t.to === highlightId) && 'bg-ball-100/70 dark:bg-ball-400/10'"
    >
      <!-- basis 讓窄螢幕放不下姓名時把金額與按鈕換到下一行，而不是把姓名擠成省略號 -->
      <div class="flex min-w-0 grow basis-48 items-center gap-2">
        <MemberAvatar :name="member(t.from).name" :color="member(t.from).color" size="sm" />
        <span class="truncate font-semibold">{{ member(t.from).name }}</span>
        <ArrowRight class="size-4 shrink-0 text-ink-300" />
        <MemberAvatar :name="member(t.to).name" :color="member(t.to).color" size="sm" />
        <span class="truncate font-semibold">{{ member(t.to).name }}</span>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <span class="num text-lg font-black">{{ formatMoney(t.amount) }}</span>
        <button
          v-if="actionable"
          type="button"
          class="btn-dark !px-3 !py-1.5 text-xs"
          :disabled="busy === keyOf(t)"
          @click="emit('record', t)"
        >
          <Check class="size-3.5" />記錄已轉帳
        </button>
      </div>
    </li>
  </ul>
</template>
