import type { LedgerRepository } from './repository'
import { DemoRepo } from './demoRepo'
import { SupabaseRepo } from './supabaseRepo'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const repo: LedgerRepository = url && anonKey ? new SupabaseRepo(url, anonKey) : new DemoRepo()

export const isDemo = repo.mode === 'demo'

export function resetDemo() {
  if (repo instanceof DemoRepo) repo.reset()
}
