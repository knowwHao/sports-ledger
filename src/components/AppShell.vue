<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { CalendarDays, House, Settings, UsersRound } from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import WhoAmIPicker from './WhoAmIPicker.vue'
import { useLedgerStore } from '@/stores/ledger'
import { teamNameOr } from '@/lib/title'

const route = useRoute()
const ledger = useLedgerStore()

const nav = [
  { to: '/', label: '首頁', icon: House, match: (p: string) => p === '/' },
  { to: '/sessions', label: '場次', icon: CalendarDays, match: (p: string) => p.startsWith('/sessions') },
  { to: '/team', label: '結餘總覽', icon: UsersRound, match: (p: string) => p === '/team' || p.startsWith('/members/') },
]
const settingsActive = computed(() => route.path === '/settings' || route.path === '/members')
const teamName = computed(() => teamNameOr(ledger.data.team_name))
</script>

<template>
  <div class="min-h-dvh lg:flex">
    <aside
      class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink-900 px-4 py-6 text-ink-100 lg:flex dark:bg-ink-900/60"
    >
      <div class="flex items-center gap-3 px-2">
        <BrandMark :size="40" />
        <div class="min-w-0">
          <p class="truncate text-base font-black tracking-tight text-white">{{ teamName }}</p>
          <p class="text-xs text-ink-300">運動分攤帳本</p>
        </div>
      </div>
      <WhoAmIPicker class="mt-6 [&_select]:!w-full [&_select]:!max-w-none" />
      <nav class="mt-6 flex flex-col gap-1">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition"
          :class="
            item.match(route.path)
              ? 'bg-ball-400 text-ink-950 shadow-glow'
              : 'text-ink-200 hover:bg-white/5 hover:text-white'
          "
        >
          <component :is="item.icon" class="size-5" />
          {{ item.label }}
        </RouterLink>
      </nav>
      <RouterLink
        to="/settings"
        class="mt-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition"
        :class="settingsActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'"
      >
        <Settings class="size-5" />成員與設定
      </RouterLink>
    </aside>

    <div class="min-w-0 flex-1">
      <header
        class="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-ink-100/60 bg-paper/85 px-4 py-2.5 backdrop-blur-lg lg:hidden dark:border-ink-800/60 dark:bg-ink-950/85"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <BrandMark :size="30" />
          <p class="truncate font-black tracking-tight">{{ teamName }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <WhoAmIPicker />
          <RouterLink
            to="/settings"
            class="icon-btn"
            :class="settingsActive && 'bg-ink-100 text-ink-900 dark:bg-ink-800 dark:text-ink-50'"
            title="成員與設定"
            aria-label="成員與設定"
          >
            <Settings class="size-5" />
          </RouterLink>
        </div>
      </header>

      <main class="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
        <slot />
      </main>
    </div>

    <nav
      class="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/90 backdrop-blur-lg lg:hidden dark:border-ink-800 dark:bg-ink-900/90"
    >
      <div class="mx-auto grid max-w-md grid-cols-3 px-2 pt-1.5 pb-1">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition"
          :class="item.match(route.path) ? 'text-ink-950 dark:text-ball-400' : 'text-ink-400'"
        >
          <span
            class="flex h-7 w-12 items-center justify-center rounded-full transition"
            :class="item.match(route.path) ? 'bg-ball-400 text-ink-950' : ''"
          >
            <component :is="item.icon" class="size-5" />
          </span>
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>
  </div>
</template>
