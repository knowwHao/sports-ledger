<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '@/stores/ledger'

const props = defineProps<{ sessionId: string }>()
const ledger = useLedgerStore()
const status = computed(() => ledger.summary.statuses.get(props.sessionId) ?? 'none')
</script>

<template>
  <span v-if="status === 'none'" class="chip-muted">尚無費用</span>
  <span v-else-if="status === 'direct'" class="chip-done" title="每位分攤者都已直接付給墊付者">已結清</span>
  <span v-else-if="status === 'netted'" class="chip-done" title="之後全隊餘額曾歸零，視為已抵銷結清">已結清（抵銷）</span>
  <span v-else class="chip-open">未結清</span>
</template>
