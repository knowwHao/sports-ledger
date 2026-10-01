<script setup lang="ts">
import type { Sport } from '@/types'

withDefaults(defineProps<{ sport: Sport; size?: 'sm' | 'md' }>(), { size: 'sm' })
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full font-semibold"
    :class="size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'"
    :style="{ backgroundColor: `${sport.color}22`, color: sport.color }"
  >
    <span aria-hidden="true">{{ sport.emoji }}</span>
    <span class="brightness-75 dark:brightness-125">{{ sport.name }}</span>
  </span>
</template>
