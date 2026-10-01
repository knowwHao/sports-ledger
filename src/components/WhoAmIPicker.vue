<script setup lang="ts">
import { computed } from 'vue'
import { UserRound } from 'lucide-vue-next'
import { useLedgerStore } from '@/stores/ledger'
import { askLogin, logout, useWhoAmI } from '@/composables/useWhoAmI'

const ledger = useLedgerStore()
const me = useWhoAmI()

// 存著的成員被封存或換了球隊連結時顯示成未選
const value = computed(() => (me.value && ledger.activeMembers.some((m) => m.id === me.value) ? me.value : ''))

async function onChange(e: Event) {
  const el = e.target as HTMLSelectElement
  const next = el.value
  // 輸入密碼成功前維持原本的選擇，取消時才不會停在別人身上
  el.value = value.value
  if (!next) logout()
  else if (next !== me.value) await askLogin(next)
}
</script>

<template>
  <label class="relative flex min-w-0 items-center">
    <span class="sr-only">我是誰</span>
    <UserRound class="pointer-events-none absolute left-2.5 size-4 text-ink-400" />
    <select :value="value" class="input !w-auto max-w-36 min-w-0 truncate !py-1.5 !pl-8 text-sm" @change="onChange">
      <option value="">我是誰？</option>
      <option v-for="m in ledger.activeMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>
  </label>
</template>
