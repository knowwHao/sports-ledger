<script setup lang="ts">
import { computed, ref } from 'vue'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, Pencil, UserPlus, Users } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import MemberEditModal from '@/components/MemberEditModal.vue'
import { useLedgerReady } from '@/composables/useLedgerReady'
import { confirmDialog } from '@/composables/useConfirm'
import { errorMessage, toast } from '@/composables/useToast'
import { formatMoney } from '@/lib/format'
import type { Member } from '@/types'

const ledger = useLedgerReady()

const input = ref('')
const adding = ref(false)
const editing = ref<Member | null>(null)
const showArchived = ref(false)

const active = computed(() => ledger.members.filter((m) => m.active))
const archived = computed(() => ledger.members.filter((m) => !m.active))
const parsed = computed(() => input.value.split(/[\s,，、]+/).map((s) => s.trim()).filter(Boolean))
const sessionCount = (id: string) => ledger.data.attendances.filter((a) => a.member_id === id).length
const balanceOf = (id: string) => ledger.summary.balances.get(id) ?? 0

async function add() {
  if (!parsed.value.length || adding.value) return
  adding.value = true
  try {
    const { added, skipped } = await ledger.createMembers(parsed.value)
    input.value = ''
    if (added) toast.success(`已新增 ${added} 位成員${skipped ? `（${skipped} 位名字重複已略過）` : ''}`)
    else toast.info('名字都已經在名冊裡了')
  } catch (e) {
    toast.error(`新增失敗：${errorMessage(e)}`)
  } finally {
    adding.value = false
  }
}

async function move(m: Member, delta: -1 | 1) {
  try {
    await ledger.moveMember(m.id, delta)
  } catch (e) {
    toast.error(`排序失敗：${errorMessage(e)}`)
  }
}

async function setActive(m: Member, value: boolean) {
  if (!value) {
    const bal = balanceOf(m.id)
    const ok = await confirmDialog({
      title: `封存 ${m.name}？`,
      message: '封存後不會出現在新場次的出席選項，歷史紀錄與欠款都會保留，可隨時恢復。',
      details: bal !== 0 ? [`${m.name} 目前淨餘額 ${bal > 0 ? '+' : '−'}${formatMoney(Math.abs(bal))}，仍會列在結算建議中`] : undefined,
      confirmText: '封存',
    })
    if (!ok) return
  }
  try {
    await ledger.updateMember(m.id, { active: value })
    toast.success(value ? `已恢復 ${m.name}` : `已封存 ${m.name}`)
  } catch (e) {
    toast.error(`操作失敗：${errorMessage(e)}`)
  }
}
</script>

<template>
  <div>
    <PageHeader title="成員" :subtitle="ledger.loaded ? `${active.length} 位在籍${archived.length ? `、${archived.length} 位已封存` : ''}` : undefined" />

    <form class="card mb-6 p-5" @submit.prevent="add">
      <label class="label" for="new-members">新增成員</label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          id="new-members"
          v-model="input"
          class="input flex-1"
          placeholder="可一次輸入多位，用空白或逗號分隔，例：小明 小華, 阿傑"
          autocomplete="off"
        />
        <button type="submit" class="btn-primary" :disabled="!parsed.length || adding">
          <UserPlus class="size-4" />新增{{ parsed.length > 1 ? ` ${parsed.length} 位` : '' }}
        </button>
      </div>
      <div v-if="parsed.length > 1" class="mt-3 flex flex-wrap gap-1.5">
        <span v-for="n in parsed" :key="n" class="chip-muted">{{ n }}</span>
      </div>
    </form>

    <SkeletonList v-if="!ledger.loaded" />

    <EmptyState v-else-if="!ledger.members.length" :icon="Users" title="名冊是空的" description="在上方輸入球友名字，一次可以加很多位" />

    <template v-else>
      <div class="card overflow-hidden">
        <ul class="divide-y divide-ink-100 dark:divide-ink-800">
          <li v-for="(m, i) in active" :key="m.id" class="flex items-center gap-3 px-4 py-3">
            <MemberAvatar :name="m.name" :color="m.color" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">{{ m.name }}</p>
              <p class="text-xs text-ink-400 dark:text-ink-300">
                參加 {{ sessionCount(m.id) }} 場 ·
                <span :class="balanceOf(m.id) < 0 ? 'text-rose-500' : balanceOf(m.id) > 0 ? 'text-ball-700 dark:text-ball-400' : ''">
                  餘額 {{ balanceOf(m.id) > 0 ? '+' : balanceOf(m.id) < 0 ? '−' : '' }}{{ formatMoney(Math.abs(balanceOf(m.id))) }}
                </span>
              </p>
            </div>
            <div class="flex items-center">
              <button type="button" class="icon-btn !size-9" :disabled="i === 0" aria-label="上移" @click="move(m, -1)">
                <ArrowUp class="size-4" />
              </button>
              <button type="button" class="icon-btn !size-9" :disabled="i === active.length - 1" aria-label="下移" @click="move(m, 1)">
                <ArrowDown class="size-4" />
              </button>
              <button type="button" class="icon-btn !size-9" aria-label="編輯" @click="editing = m">
                <Pencil class="size-4" />
              </button>
              <button type="button" class="icon-btn !size-9" aria-label="封存" @click="setActive(m, false)">
                <Archive class="size-4" />
              </button>
            </div>
          </li>
        </ul>
      </div>

      <section v-if="archived.length" class="mt-6">
        <button type="button" class="section-title flex items-center gap-1" @click="showArchived = !showArchived">
          已封存（{{ archived.length }}）
          <ChevronDown class="size-4 transition" :class="showArchived && 'rotate-180'" />
        </button>
        <div v-if="showArchived" class="card mt-3 overflow-hidden">
          <ul class="divide-y divide-ink-100 dark:divide-ink-800">
            <li v-for="m in archived" :key="m.id" class="flex items-center gap-3 px-4 py-3">
              <MemberAvatar :name="m.name" :color="m.color" muted />
              <p class="min-w-0 flex-1 truncate font-semibold text-ink-400">{{ m.name }}</p>
              <button type="button" class="btn-outline !px-3 !py-1.5 text-xs" @click="setActive(m, true)">
                <ArchiveRestore class="size-3.5" />恢復
              </button>
            </li>
          </ul>
        </div>
      </section>
    </template>

    <MemberEditModal :member="editing" @close="editing = null" />
  </div>
</template>
