<script setup lang="ts">
import { SearchX } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <EmptyState :icon="SearchX" title="找不到這個頁面" description="網址可能打錯了，或頁面已經移除">
      <RouterLink to="/" class="btn-primary">回首頁</RouterLink>
    </EmptyState>
  </div>
</template>
