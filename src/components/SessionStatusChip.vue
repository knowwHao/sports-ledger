<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '@/stores/ledger'

const props = defineProps<{ sessionId: string }>()
const ledger = useLedgerStore()
const status = computed(() => ledger.summary.statuses.get(props.sessionId) ?? 'none')
</script>

<template>
  <span v-if="status === 'none'" class="chip-muted">還沒記費用</span>
  <span v-else-if="status === 'direct' || status === 'netted'" class="chip-done">已付清</span>
  <span v-else class="chip-open">未付清</span>
</template>
