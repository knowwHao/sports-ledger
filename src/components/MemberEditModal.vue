<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ModalSheet from './ModalSheet.vue'
import MemberAvatar from './MemberAvatar.vue'
import ColorSwatches from './ColorSwatches.vue'
import type { Member } from '@/types'
import { useLedgerStore } from '@/stores/ledger'
import { errorMessage, toast } from '@/composables/useToast'

const props = defineProps<{ member: Member | null }>()
const emit = defineEmits<{ close: [] }>()
const ledger = useLedgerStore()

const form = reactive({ name: '', color: '' })
const saving = ref(false)

watch(
  () => props.member,
  (m) => {
    if (m) Object.assign(form, { name: m.name, color: m.color })
  },
)

const duplicate = computed(() =>
  ledger.data.members.some((m) => m.id !== props.member?.id && m.name === form.name.trim()),
)
const valid = computed(() => form.name.trim() && !duplicate.value)

async function submit() {
  if (!props.member || !valid.value || saving.value) return
  saving.value = true
  try {
    await ledger.updateMember(props.member.id, { name: form.name.trim(), color: form.color })
    toast.success('已更新成員')
    emit('close')
  } catch (e) {
    toast.error(`儲存失敗：${errorMessage(e)}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalSheet :open="!!member" title="編輯成員" @close="emit('close')">
    <form id="member-form" class="space-y-5" @submit.prevent="submit">
      <div class="flex justify-center pt-2">
        <MemberAvatar :name="form.name || '?'" :color="form.color" size="lg" />
      </div>
      <div>
        <label class="label" for="me-name">名字</label>
        <input id="me-name" v-model="form.name" class="input" maxlength="20" required />
        <p v-if="duplicate" class="mt-1.5 text-xs font-semibold text-rose-500">已經有同名的成員</p>
      </div>
      <div>
        <span class="label">頭像顏色</span>
        <ColorSwatches v-model="form.color" />
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="emit('close')">取消</button>
      <button type="submit" form="member-form" class="btn-primary flex-1" :disabled="!valid || saving">儲存</button>
    </template>
  </ModalSheet>
</template>
