<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogIn, ShieldAlert } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAuthStore } from '@/stores/auth'
import { isDemo } from '@/data'
import { errorMessage, toast } from '@/composables/useToast'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

function goNext() {
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
  router.replace(redirect)
}

onMounted(async () => {
  await auth.init()
  if (auth.isAdmin) goNext()
})

async function submit() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.signIn(email.value.trim(), password.value)
    if (auth.isAdmin) {
      toast.success('登入成功')
      goNext()
    } else {
      error.value = '這個帳號不是管理員，請聯絡球隊管理員把你加入 admins'
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function logout() {
  await auth.signOut()
  error.value = ''
}
</script>

<template>
  <div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink-950 px-4 py-10">
    <div class="absolute -top-32 -left-24 size-96 rounded-full bg-ball-400/20 blur-3xl" aria-hidden="true" />
    <div class="absolute -right-24 -bottom-40 size-[28rem] rounded-full bg-sky-500/10 blur-3xl" aria-hidden="true" />
    <ThemeToggle class="absolute top-4 right-4 !text-ink-200 hover:!bg-white/10" />

    <div class="relative w-full max-w-sm">
      <div class="mb-8 flex flex-col items-center text-center">
        <BrandMark :size="64" />
        <h1 class="mt-4 text-2xl font-black tracking-tight text-white">球友記帳</h1>
        <p class="mt-1 text-sm text-ink-300">管理員登入後才能記帳與修改</p>
      </div>

      <div class="rounded-[2rem] bg-white p-6 shadow-lift dark:bg-ink-900">
        <template v-if="isDemo">
          <p class="text-sm text-ink-500 dark:text-ink-300">目前是 <b>Demo 模式</b>（尚未設定 Supabase），不需要帳密。</p>
          <button type="button" class="btn-primary mt-5 w-full" @click="auth.signIn('', '').then(goNext)">
            <LogIn class="size-4" />以示範管理員進入
          </button>
        </template>

        <template v-else-if="auth.user && !auth.isAdmin">
          <div class="flex gap-3">
            <ShieldAlert class="size-6 shrink-0 text-amber-500" />
            <p class="text-sm text-ink-500 dark:text-ink-300">
              {{ auth.user.email }} 已登入，但還不是管理員。請在 Supabase 把這個帳號加入 <code>admins</code> 表。
            </p>
          </div>
          <button type="button" class="btn-outline mt-5 w-full" @click="logout">換個帳號</button>
        </template>

        <form v-else class="space-y-4" @submit.prevent="submit">
          <div>
            <label class="label" for="login-email">Email</label>
            <input id="login-email" v-model="email" class="input" type="email" autocomplete="username" required />
          </div>
          <div>
            <label class="label" for="login-password">密碼</label>
            <input
              id="login-password"
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <p v-if="error" class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {{ error }}
          </p>
          <button type="submit" class="btn-primary w-full" :disabled="loading">
            <LogIn class="size-4" />{{ loading ? '登入中…' : '登入' }}
          </button>
        </form>
      </div>
      <p class="mt-6 text-center text-xs text-ink-400">球友請使用管理員提供的分享連結查看帳目</p>
    </div>
  </div>
</template>
