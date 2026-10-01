<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, Eye, LinkIcon, RefreshCw, UserRound } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import OutstandingHero from '@/components/OutstandingHero.vue'
import TransferList from '@/components/TransferList.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import MemberSessions from '@/components/MemberSessions.vue'
import PaymentList from '@/components/PaymentList.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { repo } from '@/data'
import { useWhoAmI } from '@/composables/useWhoAmI'
import { setPublicTeamName } from '@/composables/useDocumentTitle'
import { indexLedger, memberPayments, sortedMembers, summarize } from '@/lib/ledger'
import { formatDateTime, formatMoney } from '@/lib/format'
import { teamNameOr } from '@/lib/title'
import type { LedgerData } from '@/types'

const route = useRoute()
const me = useWhoAmI()

const data = ref<LedgerData | null>(null)
const state = ref<'loading' | 'ok' | 'invalid' | 'error'>('loading')
const errorText = ref('')
const fetchedAt = ref<string | null>(null)
const expanded = ref<string | null>(null)
const refreshing = ref(false)

async function load() {
  refreshing.value = true
  try {
    const res = await repo.getPublicLedger(String(route.params.token))
    if (!res) {
      state.value = 'invalid'
      return
    }
    data.value = res
    fetchedAt.value = new Date().toISOString()
    state.value = 'ok'
    setPublicTeamName(res.team_name)
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
    state.value = 'error'
  } finally {
    refreshing.value = false
  }
}

onMounted(load)
onUnmounted(() => setPublicTeamName(null))

const idx = computed(() => (data.value ? indexLedger(data.value) : null))
const summary = computed(() => (data.value ? summarize(data.value) : null))
const members = computed(() => {
  if (!data.value || !summary.value) return []
  const bal = summary.value.balances
  return sortedMembers(data.value.members)
    .filter((m) => m.active || (bal.get(m.id) ?? 0) !== 0)
    .map((m) => ({ member: m, balance: bal.get(m.id) ?? 0 }))
    .sort((a, b) => {
      if (a.member.id === me.value) return -1
      if (b.member.id === me.value) return 1
      return a.balance - b.balance
    })
})
const meValid = computed(() => !!me.value && !!idx.value?.members.has(me.value))
const myBalance = computed(() => (meValid.value ? (summary.value?.balances.get(me.value!) ?? 0) : 0))
const myTransfers = computed(() =>
  meValid.value ? (summary.value?.transfers ?? []).filter((t) => t.from === me.value || t.to === me.value) : [],
)

function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id
}
const sessionOf = (id: string) => idx.value?.sessions.get(id)
</script>

<template>
  <div class="min-h-dvh">
    <header
      class="sticky top-0 z-30 border-b border-ink-100/60 bg-paper/85 backdrop-blur-lg dark:border-ink-800/60 dark:bg-ink-950/85"
    >
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2.5">
          <BrandMark :size="32" />
          <div class="min-w-0">
            <p class="truncate font-black tracking-tight">{{ teamNameOr(data?.team_name) }}</p>
            <p class="flex items-center gap-1 text-[11px] text-ink-400"><Eye class="size-3" />唯讀分享頁</p>
          </div>
        </div>
        <div class="flex items-center">
          <button v-if="state === 'ok'" type="button" class="icon-btn" aria-label="重新整理" :disabled="refreshing" @click="load">
            <RefreshCw class="size-5" :class="refreshing && 'animate-spin'" />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <SkeletonList v-if="state === 'loading'" :rows="5" />

      <div v-else-if="state === 'invalid'" class="flex min-h-[60dvh] items-center justify-center">
        <EmptyState :icon="LinkIcon" title="這個分享連結已失效" description="連結可能打錯，或管理員已重新產生連結。請向球隊管理員索取最新的連結。" />
      </div>

      <div v-else-if="state === 'error'" class="flex min-h-[60dvh] items-center justify-center">
        <EmptyState :icon="RefreshCw" title="暫時讀不到資料" :description="`請稍後再試（${errorText}）`">
          <button type="button" class="btn-primary" @click="load">重新載入</button>
        </EmptyState>
      </div>

      <div v-else-if="data && summary && idx" class="space-y-6">
        <section class="card flex flex-wrap items-center gap-3 p-4">
          <UserRound class="size-5 text-ink-400" />
          <label for="whoami" class="text-sm font-semibold">我是誰</label>
          <select id="whoami" v-model="me" class="input !w-auto min-w-36 flex-1 !py-2 sm:flex-none">
            <option :value="null">選擇自己</option>
            <option v-for="m in sortedMembers(data.members).filter((x) => x.active)" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <p v-if="!meValid" class="basis-full text-xs text-ink-400">選好後會記住，下次打開自己會排在最上面</p>
        </section>

        <section v-if="meValid" class="card overflow-hidden border-ball-400/70 ring-2 ring-ball-400/40">
          <div class="flex items-center gap-4 p-5">
            <MemberAvatar :name="idx.member(me!).name" :color="idx.member(me!).color" size="lg" />
            <div>
              <p class="text-sm text-ink-400">{{ idx.member(me!).name }}，你目前的淨餘額</p>
              <p
                class="num text-4xl font-black"
                :class="myBalance < 0 ? 'text-rose-600 dark:text-rose-400' : myBalance > 0 ? 'text-ball-700 dark:text-ball-400' : ''"
              >
                {{ myBalance > 0 ? '+' : myBalance < 0 ? '−' : '' }}{{ formatMoney(Math.abs(myBalance)) }}
              </p>
            </div>
          </div>
          <ul v-if="myTransfers.length" class="space-y-1 border-t border-ink-100 px-5 py-3 text-sm dark:border-ink-800">
            <li v-for="t in myTransfers" :key="`${t.from}>${t.to}`">
              <template v-if="t.from === me">
                請轉 <b class="num">{{ formatMoney(t.amount) }}</b> 給 <b>{{ idx.member(t.to).name }}</b>
              </template>
              <template v-else>
                <b>{{ idx.member(t.from).name }}</b> 會轉 <b class="num">{{ formatMoney(t.amount) }}</b> 給你
              </template>
            </li>
          </ul>
          <p v-else class="border-t border-ink-100 px-5 py-3 text-sm text-ink-400 dark:border-ink-800">你已經全部結清，不用轉帳</p>
        </section>

        <OutstandingHero
          :total="summary.outstanding"
          label="全隊待轉帳總額"
          :caption="summary.transfers.length ? `照下方 ${summary.transfers.length} 筆轉帳即可全部結清` : '目前全隊都結清了'"
        />

        <section v-if="summary.transfers.length">
          <h2 class="section-title mb-3">結算建議</h2>
          <div class="card overflow-hidden">
            <TransferList :transfers="summary.transfers" :member="idx.member" :highlight-id="meValid ? me : null" />
          </div>
        </section>

        <section>
          <h2 class="section-title mb-3">每人淨餘額</h2>
          <div class="space-y-2">
            <div
              v-for="r in members"
              :key="r.member.id"
              class="card overflow-hidden"
              :class="r.member.id === me && 'ring-2 ring-ball-400/50'"
            >
              <button type="button" class="flex w-full items-center gap-3 p-4 text-left" :aria-expanded="expanded === r.member.id" @click="toggle(r.member.id)">
                <MemberAvatar :name="r.member.name" :color="r.member.color" :muted="!r.member.active" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">
                    {{ r.member.name }}<span v-if="r.member.id === me" class="chip-done ml-1.5 !py-0">我</span>
                  </p>
                  <p class="text-xs text-ink-400">{{ r.balance < 0 ? '應付' : r.balance > 0 ? '應收' : '已結清' }}</p>
                </div>
                <p
                  class="num text-lg font-black"
                  :class="r.balance < 0 ? 'text-rose-600 dark:text-rose-400' : r.balance > 0 ? 'text-ball-700 dark:text-ball-400' : 'text-ink-300'"
                >
                  {{ r.balance > 0 ? '+' : r.balance < 0 ? '−' : '' }}{{ formatMoney(Math.abs(r.balance)) }}
                </p>
                <ChevronDown class="size-4 shrink-0 text-ink-300 transition" :class="expanded === r.member.id && 'rotate-180'" />
              </button>
              <div v-if="expanded === r.member.id" class="space-y-4 border-t border-ink-100 bg-paper/60 p-3 sm:p-4 dark:border-ink-800 dark:bg-ink-950/40">
                <MemberSessions :data="data" :member-id="r.member.id" :settlements="summary.settlements" />
                <div v-if="memberPayments(data, r.member.id).length" class="card overflow-hidden">
                  <p class="px-4 pt-3 text-xs font-bold text-ink-400">付款紀錄</p>
                  <PaymentList :payments="memberPayments(data, r.member.id)" :member="idx.member" :session="sessionOf" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <p class="text-center text-xs text-ink-400">
          資料最後更新 {{ formatDateTime(data.updated_at) }}
          <template v-if="fetchedAt"> · 讀取於 {{ formatDateTime(fetchedAt) }}</template>
        </p>
      </div>
    </main>
  </div>
</template>
