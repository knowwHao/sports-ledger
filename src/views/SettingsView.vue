<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  FlaskConical,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  SunMedium,
  Users,
} from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import SportEditModal from '@/components/SportEditModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { useAccessStore } from '@/stores/access'
import { useTheme, type ThemePref } from '@/composables/useTheme'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { isDemo, repo, resetDemo } from '@/data'
import type { Sport } from '@/types'

const ledger = useLedgerReady()
const access = useAccessStore()
const { pref } = useTheme()

const teamName = ref('')
const savingName = ref(false)
const regenerating = ref(false)
const sportModal = ref<{ open: boolean; sport: Sport | null }>({ open: false, sport: null })

watch(
  () => ledger.data.team_name,
  (v) => (teamName.value = v),
  { immediate: true },
)

const teamUrl = computed(() => (access.token ? `${location.origin}${location.pathname}#/t/${access.token}` : ''))

async function saveName() {
  const name = teamName.value.trim()
  if (!name || name === ledger.data.team_name) return
  savingName.value = true
  try {
    await ledger.updateTeamName(name)
    toast.success('已更新名稱')
  } catch (e) {
    toast.error(`儲存失敗：${errorMessage(e)}`)
  } finally {
    savingName.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(teamUrl.value)
    toast.success('已複製球隊連結')
  } catch {
    toast.error('無法自動複製，請長按連結手動複製')
  }
}

async function regenerate() {
  const ok = await confirmDialog({
    title: '重新產生球隊連結？',
    message: '舊連結會立即失效，所有球友（包括已經開過的裝置）都要改用新連結才能查看與記帳，請把新連結重新傳到群組。',
    confirmText: '重新產生',
    danger: true,
  })
  if (!ok) return
  regenerating.value = true
  try {
    access.replace(await repo.regenerateTeamToken())
    toast.success('已產生新的球隊連結，記得傳到群組')
  } catch (e) {
    toast.error(`產生失敗：${errorMessage(e)}`)
  } finally {
    regenerating.value = false
  }
}

async function toggleSport(s: Sport) {
  try {
    await ledger.updateSport(s.id, { active: !s.active })
    toast.success(s.active ? `已封存「${s.name}」` : `已恢復「${s.name}」`)
  } catch (e) {
    toast.error(`操作失敗：${errorMessage(e)}`)
  }
}

async function moveSport(s: Sport, delta: -1 | 1) {
  try {
    await ledger.moveSport(s.id, delta)
  } catch (e) {
    toast.error(`排序失敗：${errorMessage(e)}`)
  }
}

const sessionCount = (sportId: string) => ledger.data.sessions.filter((s) => s.sport_id === sportId).length

async function reset() {
  const ok = await confirmDialog({
    title: '重置示範資料？',
    message: '目前瀏覽器裡的 Demo 資料會全部清除，換成一份新的示範資料。',
    confirmText: '重置',
    danger: true,
  })
  if (!ok) return
  const t = resetDemo()
  if (t) access.replace(t)
  await ledger.refresh()
  toast.success('已重置示範資料')
}

const themes: { v: ThemePref; label: string; icon: typeof Monitor }[] = [
  { v: 'system', label: '跟隨系統', icon: Monitor },
  { v: 'light', label: '淺色', icon: SunMedium },
  { v: 'dark', label: '深色', icon: Moon },
]
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="成員與設定" />

    <div class="space-y-6">
      <RouterLink to="/members" class="card flex items-center gap-4 p-5 transition hover:shadow-lift">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-ball-400 dark:bg-ink-800">
          <Users class="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="font-bold">成員</h2>
          <p class="truncate text-sm text-ink-400 dark:text-ink-300">
            {{ ledger.activeMembers.length }} 位球友 · 新增、改名、排序、封存
          </p>
        </div>
        <ChevronRight class="size-5 shrink-0 text-ink-300" />
      </RouterLink>

      <section class="card p-5">
        <h2 class="mb-3 font-bold">球隊名稱</h2>
        <form class="flex gap-2" @submit.prevent="saveName">
          <input v-model="teamName" class="input flex-1" maxlength="30" aria-label="球隊名稱" />
          <button type="submit" class="btn-dark" :disabled="savingName || !teamName.trim() || teamName.trim() === ledger.data.team_name">
            儲存
          </button>
        </form>
      </section>

      <section class="card p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-bold">運動項目</h2>
          <button type="button" class="btn-ghost !px-3 !py-1.5 text-xs" @click="sportModal = { open: true, sport: null }">
            <Plus class="size-3.5" />新增運動
          </button>
        </div>
        <ul class="divide-y divide-ink-100 dark:divide-ink-800">
          <li v-for="(s, i) in ledger.sports" :key="s.id" class="flex items-center gap-3 py-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-2xl text-xl"
              :class="!s.active && 'opacity-40 grayscale'"
              :style="{ backgroundColor: `${s.color}33` }"
              aria-hidden="true"
              >{{ s.emoji }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold" :class="!s.active && 'text-ink-400'">
                {{ s.name }}<span v-if="!s.active" class="chip-muted ml-2">已封存</span>
              </p>
              <p class="truncate text-xs text-ink-400 dark:text-ink-300">
                {{ sessionCount(s.id) }} 場 ·
                預設：{{ s.default_expenses.map((d) => d.label).join('、') || '無' }}
              </p>
            </div>
            <div class="flex">
              <button type="button" class="icon-btn !size-9" :disabled="i === 0" aria-label="上移" @click="moveSport(s, -1)">
                <ArrowUp class="size-4" />
              </button>
              <button type="button" class="icon-btn !size-9" :disabled="i === ledger.sports.length - 1" aria-label="下移" @click="moveSport(s, 1)">
                <ArrowDown class="size-4" />
              </button>
              <button type="button" class="icon-btn !size-9" aria-label="編輯" @click="sportModal = { open: true, sport: s }">
                <Pencil class="size-4" />
              </button>
              <button type="button" class="icon-btn !size-9" :aria-label="s.active ? '封存' : '恢復'" @click="toggleSport(s)">
                <component :is="s.active ? Archive : ArchiveRestore" class="size-4" />
              </button>
            </div>
          </li>
        </ul>
        <p v-if="!ledger.sports.length" class="text-sm text-ink-400">還沒有運動項目，新增一個吧。</p>
      </section>

      <section class="card p-5">
        <h2 class="font-bold">球隊連結</h2>
        <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">
          拿到這個連結的人都能查看與記帳，只貼在球友群組裡。連結外流時按「重新產生」，舊連結立即失效。
          <template v-if="isDemo">Demo 模式下資料只在這個瀏覽器，連結只能在本機開啟。</template>
        </p>
        <div class="mt-4 rounded-2xl bg-ink-50 p-3 font-mono text-xs break-all text-ink-600 dark:bg-ink-950 dark:text-ink-300">
          {{ teamUrl }}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary" :disabled="!teamUrl" @click="copy"><Copy class="size-4" />複製連結</button>
          <button type="button" class="btn-ghost" :disabled="regenerating" @click="regenerate">
            <RefreshCw class="size-4" :class="regenerating && 'animate-spin'" />重新產生
          </button>
        </div>
      </section>

      <section class="card p-5">
        <h2 class="mb-3 font-bold">外觀</h2>
        <div class="grid grid-cols-3 gap-1 rounded-2xl bg-ink-100 p-1 dark:bg-ink-800">
          <button
            v-for="t in themes"
            :key="t.v"
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition"
            :class="pref === t.v ? 'bg-white shadow-soft dark:bg-ink-950' : 'text-ink-400'"
            @click="pref = t.v"
          >
            <component :is="t.icon" class="size-4" />{{ t.label }}
          </button>
        </div>
      </section>

      <section v-if="isDemo" class="card border-ball-400/60 p-5">
        <h2 class="flex items-center gap-2 font-bold"><FlaskConical class="size-5 text-ball-600" />Demo 模式</h2>
        <p class="mt-1 text-sm text-ink-400 dark:text-ink-300">
          尚未設定 Supabase，資料存在這個瀏覽器的 localStorage。設定方式請見 README。
        </p>
        <button type="button" class="btn-outline mt-4" @click="reset"><RotateCcw class="size-4" />重置示範資料</button>
      </section>
    </div>

    <SportEditModal :open="sportModal.open" :sport="sportModal.sport" @close="sportModal = { open: false, sport: null }" />
  </div>
</template>
