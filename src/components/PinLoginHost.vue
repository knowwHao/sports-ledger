<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ModalSheet from './ModalSheet.vue'
import MemberAvatar from './MemberAvatar.vue'
import { useLedgerStore } from '@/stores/ledger'
import { login, pendingLogin, pinFailureText } from '@/composables/useWhoAmI'
import { errorMessage } from '@/composables/useToast'
import { isValidPin } from '@/lib/pin'

const ledger = useLedgerStore()
const pin = ref('')
const error = ref('')
const busy = ref(false)
const input = ref<HTMLInputElement | null>(null)

const member = computed(() => (pendingLogin.value ? ledger.idx.member(pendingLogin.value.memberId) : null))

// 手機上視窗一彈出就叫出鍵盤時，iOS 的鍵盤工具列會先壓在視窗內容上，看起來像跑版，所以只在有滑鼠時自動聚焦
function focusInput() {
  if (window.matchMedia('(pointer: fine)').matches) input.value?.focus()
}

watch(pendingLogin, async (p) => {
  pin.value = ''
  error.value = ''
  if (p) {
    await nextTick()
    focusInput()
  }
})

function finish(ok: boolean) {
  const p = pendingLogin.value
  pendingLogin.value = null
  p?.resolve(ok)
}

async function submit() {
  const p = pendingLogin.value
  if (!p || busy.value || !isValidPin(pin.value)) return
  busy.value = true
  error.value = ''
  try {
    const r = await login(p.memberId, pin.value)
    if (r.ok) finish(true)
    else {
      error.value = pinFailureText(r)
      pin.value = ''
      focusInput()
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ModalSheet :open="!!pendingLogin" title="輸入密碼" top @close="finish(false)">
    <form v-if="member" id="pin-login-form" class="space-y-4" @submit.prevent="submit">
      <div class="flex items-center gap-3 pt-1">
        <MemberAvatar :name="member.name" :color="member.color" size="sm" />
        <p class="min-w-0 truncate font-bold">{{ member.name }}</p>
      </div>
      <div>
        <label class="label" for="pin-login">密碼</label>
        <input
          id="pin-login"
          ref="input"
          v-model="pin"
          class="input num text-center text-2xl tracking-[0.5em]"
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          maxlength="8"
          placeholder="••••"
        />
        <p v-if="error" class="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{{ error }}</p>
        <p v-else class="mt-1.5 text-xs text-ink-400 dark:text-ink-300">
          還沒改過的話是 0000，登入後可到「成員與設定」修改；忘記密碼請找管理者重設
        </p>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn-outline flex-1" @click="finish(false)">取消</button>
      <button type="submit" form="pin-login-form" class="btn-primary flex-1" :disabled="busy || !isValidPin(pin)">
        {{ busy ? '確認中…' : '確定' }}
      </button>
    </template>
  </ModalSheet>
</template>
