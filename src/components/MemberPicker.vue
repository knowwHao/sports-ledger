<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import MemberAvatar from './MemberAvatar.vue'
import type { Member } from '@/types'

const model = defineModel<string[]>({ required: true })
defineProps<{ members: Member[]; disabled?: boolean }>()
const emit = defineEmits<{ toggle: [id: string, selected: boolean] }>()

function toggle(id: string) {
  const on = !model.value.includes(id)
  model.value = on ? [...model.value, id] : model.value.filter((x) => x !== id)
  emit('toggle', id, on)
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="m in members"
      :key="m.id"
      type="button"
      :disabled="disabled"
      :aria-pressed="model.includes(m.id)"
      class="flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm font-semibold transition disabled:cursor-not-allowed"
      :class="
        model.includes(m.id)
          ? 'border-ball-500 bg-ball-200/70 text-ink-950 dark:border-ball-400/60 dark:bg-ball-400/15 dark:text-ball-200'
          : 'border-ink-200 text-ink-400 hover:border-ink-300 dark:border-ink-700 dark:text-ink-400'
      "
      @click="toggle(m.id)"
    >
      <MemberAvatar :name="m.name" :color="m.color" size="xs" :muted="!model.includes(m.id)" />
      {{ m.name }}
      <Check v-if="model.includes(m.id)" class="size-3.5" />
    </button>
  </div>
</template>
