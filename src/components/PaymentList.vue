<script setup lang="ts">
import { ArrowRight, Trash2 } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import type { Id, Member, Payment, Session } from '@/types'
import { formatDateTime, formatMoney, sessionTitle } from '@/lib/format'

defineProps<{
  payments: Payment[]
  member: (id: Id) => Member
  session?: (id: Id) => Session | undefined
  deletable?: boolean
}>()
const emit = defineEmits<{ remove: [p: Payment] }>()
</script>

<template>
  <ul class="divide-y divide-ink-100 dark:divide-ink-800">
    <li v-for="p in payments" :key="p.id" class="flex items-center gap-3 px-4 py-3">
      <div class="flex shrink-0 items-center -space-x-1.5">
        <MemberAvatar :name="member(p.from_member_id).name" :color="member(p.from_member_id).color" size="xs" />
        <MemberAvatar :name="member(p.to_member_id).name" :color="member(p.to_member_id).color" size="xs" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1 truncate text-sm font-semibold">
          {{ member(p.from_member_id).name }}<ArrowRight class="size-3.5 shrink-0 text-ink-300" />{{ member(p.to_member_id).name }}
        </p>
        <p class="truncate text-xs text-ink-400 dark:text-ink-300">
          {{ formatDateTime(p.paid_at) }}
          <template v-if="p.session_id && session?.(p.session_id)"> · {{ sessionTitle(session(p.session_id)!) }}</template>
          <template v-if="p.note"> · {{ p.note }}</template>
        </p>
      </div>
      <span class="num font-bold">{{ formatMoney(p.amount) }}</span>
      <button v-if="deletable" type="button" class="icon-btn !size-8" aria-label="刪除付款紀錄" @click="emit('remove', p)">
        <Trash2 class="size-4" />
      </button>
    </li>
  </ul>
</template>
