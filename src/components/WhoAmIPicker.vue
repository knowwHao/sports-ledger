<script setup lang="ts">
import { computed } from 'vue'
import { UserRound } from 'lucide-vue-next'
import { useLedgerStore } from '@/stores/ledger'
import { useWhoAmI } from '@/composables/useWhoAmI'

const ledger = useLedgerStore()
const me = useWhoAmI()

// 存著的成員被封存或換了球隊連結時顯示成未選
const value = computed({
  get: () => (me.value && ledger.activeMembers.some((m) => m.id === me.value) ? me.value : null),
  set: (v: string | null) => (me.value = v),
})
</script>

<template>
  <label class="relative flex min-w-0 items-center">
    <span class="sr-only">我是誰</span>
    <UserRound class="pointer-events-none absolute left-2.5 size-4 text-ink-400" />
    <select v-model="value" class="input !w-auto max-w-36 min-w-0 truncate !py-1.5 !pl-8 text-sm">
      <option :value="null">我是誰？</option>
      <option v-for="m in ledger.activeMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>
  </label>
</template>
