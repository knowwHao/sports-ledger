<script setup lang="ts">
import { computed } from 'vue'
import { avatarText } from '@/lib/avatar'

const props = withDefaults(defineProps<{ name: string; color: string; size?: 'xs' | 'sm' | 'md' | 'lg'; muted?: boolean }>(), {
  size: 'md',
})

const sizeClass = computed(
  () =>
    ({
      xs: 'size-6 text-[11px]',
      sm: 'size-8 text-sm',
      md: 'size-10 text-base',
      lg: 'size-14 text-xl',
    })[props.size],
)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white/80 select-none dark:ring-ink-900"
    :class="[sizeClass, muted && 'opacity-45 grayscale']"
    :style="{ backgroundColor: color }"
    :title="name"
    aria-hidden="true"
    >{{ avatarText(name) }}</span
  >
</template>
