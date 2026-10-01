<script setup lang="ts">
import { computed } from 'vue'
import { FlaskConical, Link2, Link2Off, LoaderCircle, RefreshCw, Trash2 } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import EmptyState from '@/components/EmptyState.vue'
import { demoTeamToken, isDemo } from '@/data'
import { useAccessStore } from '@/stores/access'

const access = useAccessStore()

const view = computed(() => {
  switch (access.status) {
    case 'invalid':
      return {
        icon: Link2Off,
        title: '這個球隊連結已失效',
        description: '連結可能打錯，或已經被重新產生過。請到球友群組要最新的球隊連結，再用新連結開啟。',
      }
    case 'error':
      return { icon: RefreshCw, title: '暫時讀不到資料', description: `請確認網路後再試一次（${access.errorText}）` }
    default:
      return {
        icon: Link2,
        title: '請用球友群組裡的球隊連結開啟',
        description: '這是球隊自己的記帳本，要用球隊連結開啟才能查看與記帳。開過一次之後，這台裝置會記住。',
      }
  }
})

function enterDemo() {
  const t = demoTeamToken()
  if (t) void access.use(t)
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2.5">
        <BrandMark :size="32" />
        <p class="truncate font-black tracking-tight">球友記帳</p>
      </div>
      <ThemeToggle />
    </header>

    <main class="mx-auto flex min-h-[70dvh] max-w-3xl items-center justify-center px-4 pb-16">
      <div v-if="access.status === 'checking'" class="flex items-center gap-2 text-sm text-ink-400" role="status">
        <LoaderCircle class="size-5 animate-spin" />讀取中…
      </div>

      <EmptyState v-else :icon="view.icon" :title="view.title" :description="view.description">
        <div class="flex flex-wrap justify-center gap-2">
          <button v-if="access.status === 'error'" type="button" class="btn-primary" @click="access.verify()">
            <RefreshCw class="size-4" />重新載入
          </button>
          <button v-if="access.status === 'invalid' || access.status === 'error'" type="button" class="btn-outline" @click="access.use(null)">
            <Trash2 class="size-4" />清除舊連結
          </button>
          <button v-if="isDemo && access.status === 'none'" type="button" class="btn-primary" @click="enterDemo">
            <FlaskConical class="size-4" />進入示範帳本
          </button>
        </div>
      </EmptyState>
    </main>
  </div>
</template>
