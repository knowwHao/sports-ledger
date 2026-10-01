<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 36 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 48 48" aria-hidden="true">
    <rect width="48" height="48" rx="14" fill="#0f1b2d" />
    <circle cx="24" cy="24" r="14" fill="#d4f53c" />
    <path d="M12.8 15.6Q21.2 24 12.8 32.4M35.2 15.6Q26.8 24 35.2 32.4" fill="none" stroke="#0f1b2d" stroke-width="2.4" stroke-linecap="round" />
    <path d="M37 9.5l3-3M39.5 13l3.5-1.5M33.5 7l1.5-3.5" stroke="#d4f53c" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>
