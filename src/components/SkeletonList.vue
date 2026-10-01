<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 4 })
</script>

<template>
  <div class="space-y-3" aria-busy="true" aria-label="載入中">
    <div v-for="i in rows" :key="i" class="card flex animate-pulse items-center gap-3 p-4">
      <div class="size-10 rounded-full bg-ink-100 dark:bg-ink-800" />
      <div class="flex-1 space-y-2">
        <div class="h-3 w-1/3 rounded bg-ink-100 dark:bg-ink-800" />
        <div class="h-3 w-1/2 rounded bg-ink-100/70 dark:bg-ink-800/70" />
      </div>
    </div>
  </div>
</template>
