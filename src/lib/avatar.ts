export const AVATAR_COLORS = [
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#6366f1',
  '#3b82f6',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#84cc16',
  '#eab308',
  '#78716c',
]

/** 中文名取最後一字（習慣叫名），英文名取首字母 */
export function avatarText(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/^[\x20-\x7e]+$/.test(trimmed)) return trimmed[0].toUpperCase()
  return Array.from(trimmed).at(-1)!
}

export function pickColor(seed: number): string {
  return AVATAR_COLORS[((seed % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length]
}
