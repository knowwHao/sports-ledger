<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import DemoBanner from '@/components/DemoBanner.vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import AccessView from '@/views/AccessView.vue'
import { isDemo } from '@/data'
import { useAccessStore } from '@/stores/access'
import { useDocumentTitle } from '@/composables/useDocumentTitle'

const route = useRoute()
const access = useAccessStore()
const bare = computed(() => route.meta.bare === true)

useDocumentTitle()
</script>

<template>
  <DemoBanner v-if="isDemo" />
  <AccessView v-if="access.status !== 'ok'" />
  <RouterView v-else v-slot="{ Component }">
    <template v-if="!route.matched.length" />
    <component :is="Component" v-else-if="bare" />
    <AppShell v-else>
      <component :is="Component" :key="route.path" />
    </AppShell>
  </RouterView>
  <UpdatePrompt />
  <ToastHost />
  <ConfirmHost />
</template>
