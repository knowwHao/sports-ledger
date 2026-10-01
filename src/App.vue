<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import DemoBanner from '@/components/DemoBanner.vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import { isDemo } from '@/data'
import { useDocumentTitle } from '@/composables/useDocumentTitle'

const route = useRoute()
const bare = computed(() => route.meta.public === true)

useDocumentTitle()
</script>

<template>
  <DemoBanner v-if="isDemo" />
  <RouterView v-slot="{ Component }">
    <template v-if="!route.matched.length" />
    <component :is="Component" v-else-if="bare" />
    <AppShell v-else>
      <component :is="Component" :key="route.path" />
    </AppShell>
  </RouterView>
  <ToastHost />
  <ConfirmHost />
</template>
