<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '@/stores/ledger'

const props = defineProps<{ sessionId: string }>()
const ledger = useLedgerStore()
const status = computed(() => ledger.summary.statuses.get(props.sessionId) ?? 'none')
</script>

<template>
  <span v-if="status === 'none'" class="chip-muted">還沒記費用</span>
  <span v-else-if="status === 'direct'" class="chip-done" title="每個人都已經把這場的錢付給付錢的人">已付清</span>
  <span v-else-if="status === 'netted'" class="chip-done" title="這場之後全隊的帳曾經全部打平，這場就算清了">已打平</span>
  <span v-else class="chip-open">未付清</span>
</template>
