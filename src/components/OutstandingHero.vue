<script setup lang="ts">
import { formatMoney } from '@/lib/format'

defineProps<{ total: number; caption: string; label?: string }>()
</script>

<template>
  <section class="relative overflow-hidden rounded-[2rem] bg-ink-900 p-6 text-white shadow-lift sm:p-8 dark:bg-ink-800">
    <svg class="pointer-events-none absolute inset-0 h-full w-full opacity-[0.09]" preserveAspectRatio="none" viewBox="0 0 400 200" aria-hidden="true">
      <g fill="none" stroke="#d4f53c" stroke-width="2">
        <rect x="20" y="20" width="360" height="160" rx="4" />
        <line x1="200" y1="20" x2="200" y2="180" />
        <line x1="140" y1="20" x2="140" y2="180" />
        <line x1="260" y1="20" x2="260" y2="180" />
        <line x1="20" y1="100" x2="140" y2="100" />
        <line x1="260" y1="100" x2="380" y2="100" />
      </g>
    </svg>
    <div class="absolute -top-16 -right-10 size-48 rounded-full bg-ball-400/25 blur-3xl" aria-hidden="true" />
    <div class="relative">
      <p class="text-sm font-semibold text-ink-200">{{ label ?? '總未收金額' }}</p>
      <p class="num mt-2 text-5xl font-black tracking-tight text-ball-400 sm:text-6xl">{{ formatMoney(total) }}</p>
      <p class="mt-3 text-sm text-ink-200">{{ caption }}</p>
      <div v-if="$slots.default" class="mt-5"><slot /></div>
    </div>
  </section>
</template>
