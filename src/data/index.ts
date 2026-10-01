import type { LedgerRepository } from './repository'
import { DemoRepo } from './demoRepo'
import { SupabaseRepo } from './supabaseRepo'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const repo: LedgerRepository = url && anonKey ? new SupabaseRepo(url, anonKey) : new DemoRepo()

export const isDemo = repo.mode === 'demo'

/** 重置 Demo 資料並回傳新的球隊 token；非 Demo 模式回 null */
export function resetDemo(): string | null {
  return repo instanceof DemoRepo ? repo.reset() : null
}

export function demoTeamToken(): string | null {
  return repo instanceof DemoRepo ? repo.teamToken : null
}
