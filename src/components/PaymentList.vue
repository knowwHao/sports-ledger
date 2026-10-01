<script setup lang="ts">
import { ArrowRight, Trash2 } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import type { Id, Member, Payment, Session } from '@/types'
import { formatDateTime, formatMoney, sessionTitle } from '@/lib/format'

defineProps<{
  payments: Payment[]
  member: (id: Id) => Member
  session?: (id: Id) => Session | undefined
  /** 只有收款人本人能刪 */
  canDelete?: (p: Payment) => boolean
}>()
const emit = defineEmits<{ remove: [p: Payment] }>()
</script>

<template>
  <!-- 桌機版放在窄的側欄時寬度不到 18rem，隱藏頭像把空間讓給姓名 -->
  <ul class="@container divide-y divide-ink-100 dark:divide-ink-800">
    <li v-for="p in payments" :key="p.id" class="flex items-center gap-3 px-4 py-3">
      <div class="hidden shrink-0 items-center -space-x-1.5 @2xs:flex">
        <MemberAvatar :name="member(p.from_member_id).name" :color="member(p.from_member_id).color" size="xs" />
        <MemberAvatar :name="member(p.to_member_id).name" :color="member(p.to_member_id).color" size="xs" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1 text-sm font-semibold">
          <span class="truncate">{{ member(p.from_member_id).name }}</span>
          <ArrowRight class="size-3.5 shrink-0 text-ink-300" />
          <span class="truncate">{{ member(p.to_member_id).name }}</span>
        </p>
        <p class="truncate text-xs text-ink-400 dark:text-ink-300">
          {{ formatDateTime(p.paid_at) }}
          <template v-if="p.session_id && session?.(p.session_id)"> · {{ sessionTitle(session(p.session_id)!) }}</template>
          <template v-if="p.note"> · {{ p.note }}</template>
        </p>
      </div>
      <span class="num shrink-0 font-bold">{{ formatMoney(p.amount) }}</span>
      <button v-if="canDelete?.(p)" type="button" class="icon-btn !size-8 shrink-0" aria-label="刪除付款紀錄" @click="emit('remove', p)">
        <Trash2 class="size-4" />
      </button>
    </li>
  </ul>
</template>
