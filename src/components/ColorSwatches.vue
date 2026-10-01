<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { AVATAR_COLORS } from '@/lib/avatar'

const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ colors?: string[] }>(), { colors: () => AVATAR_COLORS })
</script>

<template>
  <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="顏色">
    <button
      v-for="c in colors"
      :key="c"
      type="button"
      role="radio"
      :aria-checked="model === c"
      :aria-label="c"
      class="flex size-9 items-center justify-center rounded-full ring-offset-2 transition active:scale-90 dark:ring-offset-ink-900"
      :class="model === c && 'ring-2 ring-ink-900 dark:ring-white'"
      :style="{ backgroundColor: c }"
      @click="model = c"
    >
      <Check v-if="model === c" class="size-4 text-white" />
    </button>
  </div>
</template>
