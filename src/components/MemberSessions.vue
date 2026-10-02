<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import SportBadge from './SportBadge.vue'
import type { Id, LedgerData } from '@/types'
import { guestLabel, indexLedger, memberLines } from '@/lib/ledger'
import { sessionCoverage, type PairCoverage, type SettleReason } from '@/lib/balance'
import { formatMoney, sessionSortKey, sessionSubtitle, sessionTitle } from '@/lib/format'

const props = defineProps<{
  data: LedgerData
  memberId: Id
  settlements: Map<Id, SettleReason>
  /** 各場已個人事後打平的欠款者 */
  netted: Map<Id, Set<Id>>
  /** 只有收款人本人能標記已付 */
  canPay?: (p: PairCoverage) => boolean
  busy?: string | null
}>()
const emit = defineEmits<{ pay: [pair: PairCoverage, sessionId: Id]; open: [sessionId: Id] }>()

const idx = computed(() => indexLedger(props.data))

function guestNoteOf(sessionId: Id): string {
  const g = props.data.guests.find((x) => x.session_id === sessionId && x.member_id === props.memberId)
  if (!g) return ''
  return guestLabel(g, props.data.attendances.some((a) => a.session_id === sessionId && a.member_id === props.memberId))
}

const groups = computed(() => {
  const map = new Map<Id, ReturnType<typeof memberLines>>()
  for (const line of memberLines(props.data, props.memberId)) map.set(line.session.id, [...(map.get(line.session.id) ?? []), line])
  // 代付但沒分攤的場次不在 memberLines 裡，要另外補上
  const advancedAll = props.data.expenses.filter((e) => e.payer_member_id === props.memberId)
  const ids = new Set([...map.keys(), ...advancedAll.map((e) => e.session_id)])
  return props.data.sessions
    .filter((s) => ids.has(s.id))
    .sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)) || b.created_at.localeCompare(a.created_at))
    .map((session) => ({
      session,
      sport: idx.value.sport(session.sport_id),
      lines: map.get(session.id) ?? [],
      pairs: sessionCoverage(props.data, session.id).filter((p) => p.member_id === props.memberId),
      advanced: advancedAll.filter((e) => e.session_id === session.id),
      settled: props.settlements.get(session.id),
      netted: !!props.netted.get(session.id)?.has(props.memberId),
      guestNote: guestNoteOf(session.id),
    }))
})
</script>

<template>
  <div class="space-y-3">
    <div v-for="g in groups" :key="g.session.id" class="card overflow-hidden">
      <button type="button" class="flex w-full items-start justify-between gap-3 px-4 pt-4 pb-2 text-left" @click="emit('open', g.session.id)">
        <div class="min-w-0">
          <p class="truncate font-bold">{{ sessionTitle(g.session) }}</p>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400 dark:text-ink-300">
            <SportBadge :sport="g.sport" />{{ sessionSubtitle(g.session) }}
          </p>
        </div>
        <span v-if="g.settled" class="chip-done shrink-0">已付清</span>
        <span v-else class="chip-open shrink-0">未付清</span>
      </button>
      <p v-if="g.guestNote" class="px-4 pb-1 text-xs text-ink-400 dark:text-ink-300">{{ g.guestNote }}</p>
      <ul class="space-y-1 px-4 pb-2 text-sm">
        <li v-for="l in g.lines" :key="l.expense.id" class="flex justify-between gap-3 text-ink-500 dark:text-ink-300">
          <span class="truncate">{{ l.expense.label }}<template v-if="l.isPayer">（自己付的）</template></span>
          <span class="num">{{ formatMoney(l.share.amount_due) }}</span>
        </li>
        <li v-for="e in g.advanced" :key="`adv-${e.id}`" class="flex justify-between gap-3 text-ball-700 dark:text-ball-400">
          <span class="truncate">先付了「{{ e.label }}」</span>
          <span class="num">+{{ formatMoney(e.amount) }}</span>
        </li>
      </ul>
      <ul v-if="g.pairs.length" class="divide-y divide-ink-100 border-t border-ink-100 dark:divide-ink-800 dark:border-ink-800">
        <li v-for="p in g.pairs" :key="p.payer_id" class="flex items-center gap-3 px-4 py-2.5">
          <p class="min-w-0 flex-1 truncate text-sm">
            付給 <span class="font-semibold">{{ idx.member(p.payer_id).name }}</span>
            <span class="num ml-1 font-bold">{{ formatMoney(p.due) }}</span>
          </p>
          <span v-if="p.paid >= p.due || g.netted" class="chip-done"><Check class="size-3" />已付</span>
          <template v-else>
            <span v-if="p.paid > 0" class="chip-open num">已付 {{ formatMoney(p.paid) }}</span>
            <button
              v-if="canPay?.(p) && !g.settled"
              type="button"
              class="btn-outline !px-3 !py-1.5 text-xs"
              :disabled="busy === `${g.session.id}:${p.payer_id}`"
              @click="emit('pay', p, g.session.id)"
            >
              <Check class="size-3.5" />標記已付
            </button>
            <span v-else-if="!p.paid" class="chip-muted">還沒付</span>
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>
