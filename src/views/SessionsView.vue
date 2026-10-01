<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarPlus, Plus, Search, SearchX } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import SessionCard from '@/components/SessionCard.vue'
import SessionFormModal from '@/components/SessionFormModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import SportFilter from '@/components/SportFilter.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { attendeeIds } from '@/lib/ledger'
import { formatDate, monthLabel, sessionMonthKey } from '@/lib/format'
import type { Session } from '@/types'

const ledger = useLedgerReady()
const route = useRoute()
const router = useRouter()

const query = ref('')
const filter = ref<'all' | 'open' | 'done'>('all')
const sport = ref('all')
const showForm = ref(route.query.new === '1')

watch(
  () => route.query.new,
  (v) => {
    if (v === '1') showForm.value = true
  },
)

function closeForm() {
  showForm.value = false
  if (route.query.new) router.replace({ query: {} })
}

function onCreated(id: string) {
  showForm.value = false
  router.push(`/sessions/${id}`)
}

function haystack(s: Session): string {
  const names = attendeeIds(ledger.data, s.id).map((id) => ledger.idx.member(id).name)
  const sportName = ledger.idx.sport(s.sport_id).name
  return [s.title, s.location, s.note, sportName, s.play_date && formatDate(s.play_date), ...names]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return ledger.sessions.filter((s) => {
    if (sport.value !== 'all' && (s.sport_id ?? '') !== sport.value) return false
    if (q && !q.split(/\s+/).every((t) => haystack(s).includes(t))) return false
    if (filter.value === 'all') return true
    const status = ledger.summary.statuses.get(s.id)
    return filter.value === 'done' ? status === 'direct' || status === 'netted' : status === 'open'
  })
})

const groups = computed(() => {
  const map = new Map<string, Session[]>()
  for (const s of filtered.value) {
    const k = sessionMonthKey(s)
    map.set(k, [...(map.get(k) ?? []), s])
  }
  return [...map.entries()].map(([key, list]) => ({ key, label: monthLabel(key), list }))
})

const filters = [
  { v: 'all', label: '全部' },
  { v: 'open', label: '未結清' },
  { v: 'done', label: '已結清' },
] as const
</script>

<template>
  <div>
    <PageHeader title="場次" :subtitle="ledger.loaded ? `共 ${ledger.sessions.length} 筆` : undefined">
      <button type="button" class="btn-primary" @click="showForm = true"><Plus class="size-4" />新增場次</button>
    </PageHeader>

    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-300" />
        <input v-model="query" type="search" class="input !pl-11" placeholder="搜尋標題、地點、運動或成員" aria-label="搜尋場次" />
      </div>
      <div class="flex gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
        <button
          v-for="f in filters"
          :key="f.v"
          type="button"
          class="flex-1 rounded-xl px-4 py-1.5 text-sm font-semibold transition sm:flex-none"
          :class="filter === f.v ? 'bg-white shadow-soft dark:bg-ink-950' : 'text-ink-400'"
          @click="filter = f.v"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <SportFilter v-model="sport" class="mb-5" />

    <SkeletonList v-if="!ledger.loaded" />

    <EmptyState
      v-else-if="!ledger.sessions.length"
      :icon="CalendarPlus"
      title="還沒有任何場次"
      description="新增一場球局，記下場地費與誰先墊付"
    >
      <button type="button" class="btn-primary" @click="showForm = true"><Plus class="size-4" />新增第一場</button>
    </EmptyState>

    <EmptyState v-else-if="!groups.length" :icon="SearchX" title="找不到符合的場次" description="換個關鍵字或篩選條件試試" />

    <div v-else class="space-y-8">
      <section v-for="g in groups" :key="g.key">
        <h2 class="section-title mb-3 flex items-center gap-2">
          {{ g.label }}
          <span class="chip-muted num">{{ g.list.length }}</span>
        </h2>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SessionCard v-for="s in g.list" :key="s.id" :session="s" />
        </div>
      </section>
    </div>

    <SessionFormModal :open="showForm" @close="closeForm" @saved="onCreated" />
  </div>
</template>
