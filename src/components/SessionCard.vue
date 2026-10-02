<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Lock } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import SessionStatusChip from './SessionStatusChip.vue'
import type { Session } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { attendeeIds, sessionTotals } from '@/lib/ledger'
import { formatMoney, parseDate, sessionSubtitle, sessionTitle } from '@/lib/format'

const props = defineProps<{ session: Session }>()
const ledger = useLedgerStore()

const totals = computed(() => sessionTotals(ledger.data, props.session.id))
const sport = computed(() => ledger.idx.sport(props.session.sport_id))
const attendees = computed(() => attendeeIds(ledger.data, props.session.id).map((id) => ledger.idx.member(id)))
const day = computed(() => (props.session.play_date ? parseDate(props.session.play_date) : null))
</script>

<template>
  <RouterLink
    :to="`/sessions/${session.id}`"
    class="card relative flex items-center gap-4 overflow-hidden p-4 pl-5 transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
  >
    <span class="absolute inset-y-0 left-0 w-1.5" :style="{ backgroundColor: sport.color }" aria-hidden="true" />
    <div
      class="relative flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-ink-900 text-white dark:bg-ink-800"
    >
      <template v-if="day">
        <span class="text-[10px] font-semibold text-ink-300">{{ day.getMonth() + 1 }}月</span>
        <span class="num -mt-0.5 text-xl leading-none font-black">{{ day.getDate() }}</span>
      </template>
      <span v-else class="text-2xl" aria-hidden="true">{{ sport.emoji }}</span>
      <span
        v-if="day"
        class="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full bg-white text-sm shadow-soft dark:bg-ink-700"
        :title="sport.name"
        aria-hidden="true"
        >{{ sport.emoji }}</span
      >
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <p class="truncate font-bold">{{ sessionTitle(session) }}</p>
        <Lock v-if="session.locked" class="size-3.5 shrink-0 text-ink-300" aria-label="已鎖定" />
      </div>
      <p class="truncate text-xs text-ink-400 dark:text-ink-300">
        <span class="font-semibold" :style="{ color: sport.color }">{{ sport.name }}</span>
        <template v-if="sessionSubtitle(session)"> · {{ sessionSubtitle(session) }}</template>
      </p>
      <div class="mt-2 flex -space-x-1.5">
        <MemberAvatar v-for="m in attendees.slice(0, 7)" :key="m.id" :name="m.name" :color="m.color" size="xs" />
        <span
          v-if="attendees.length > 7"
          class="num inline-flex size-6 items-center justify-center rounded-full bg-ink-100 text-[10px] font-bold text-ink-500 ring-2 ring-white dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-900"
          >+{{ attendees.length - 7 }}</span
        >
        <span v-if="totals.guestCount" class="ml-3 self-center text-[11px] font-semibold whitespace-nowrap text-ink-400 dark:text-ink-300">
          ＋朋友 {{ totals.guestCount }}
        </span>
      </div>
    </div>
    <div class="shrink-0 text-right">
      <p class="num font-black">{{ formatMoney(totals.total) }}</p>
      <SessionStatusChip class="mt-1" :session-id="session.id" />
    </div>
  </RouterLink>
</template>
