<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '@/stores/ledger'
import { OTHER_SPORT } from '@/lib/ledger'

/** 'all'＝全部；''＝無運動（年費／雜費） */
const model = defineModel<string>({ default: 'all' })
const ledger = useLedgerStore()

const options = computed(() => {
  const used = new Set(ledger.data.sessions.map((s) => s.sport_id ?? ''))
  const list = ledger.sports
    .filter((s) => s.active || used.has(s.id))
    .map((s) => ({ id: s.id, label: s.name, emoji: s.emoji, color: s.color }))
  if (used.has('')) list.push({ id: '', label: OTHER_SPORT.name, emoji: OTHER_SPORT.emoji, color: OTHER_SPORT.color })
  return list
})
</script>

<template>
  <div v-if="options.length > 1" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="依運動篩選">
    <button
      type="button"
      role="tab"
      :aria-selected="model === 'all'"
      class="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition"
      :class="
        model === 'all'
          ? 'border-ink-900 bg-ink-900 text-white dark:border-ball-400 dark:bg-ball-400 dark:text-ink-950'
          : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300'
      "
      @click="model = 'all'"
    >
      全部
    </button>
    <button
      v-for="o in options"
      :key="o.id"
      type="button"
      role="tab"
      :aria-selected="model === o.id"
      class="flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition"
      :class="model === o.id ? 'text-ink-950' : 'border-ink-200 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300'"
      :style="model === o.id ? { backgroundColor: o.color, borderColor: o.color } : {}"
      @click="model = o.id"
    >
      <span aria-hidden="true">{{ o.emoji }}</span>{{ o.label }}
    </button>
  </div>
</template>
