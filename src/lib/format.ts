import type { Session } from '@/types'

const money = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 })
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 單筆費用／付款金額上限，防止誤輸入天文數字或 Infinity */
export const MAX_AMOUNT = 10_000_000

export function formatMoney(n: number): string {
  return `$${money.format(n)}`
}

/** 以本地時區解析 YYYY-MM-DD，避免 new Date('2026-10-01') 被當成 UTC 而跨日 */
export function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toYmd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function todayYmd(): string {
  return toYmd(new Date())
}

export function formatDate(ymd: string, withYear = false): string {
  const d = parseDate(ymd)
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  return `${withYear ? `${d.getFullYear()}/` : ''}${md}（${WEEKDAYS[d.getDay()]}）`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y} 年 ${Number(m)} 月`
}

/** 場次的分組鍵；無日期場次以建立時間的月份歸組 */
export function sessionMonthKey(s: Session): string {
  if (s.play_date) return s.play_date.slice(0, 7)
  return toYmd(new Date(s.created_at)).slice(0, 7)
}

export function sessionTitle(s: Session): string {
  if (s.title) return s.title
  if (s.play_date) return `${formatDate(s.play_date)} 打球`
  return '未命名費用'
}

export function sessionSubtitle(s: Session): string {
  const parts: string[] = []
  if (s.title && s.play_date) parts.push(formatDate(s.play_date))
  if (!s.play_date) parts.push('非打球費用')
  if (s.location) parts.push(s.location)
  return parts.join(' · ')
}

/** 場次排序值：有日期用日期，無日期用建立日 */
export function sessionSortKey(s: Session): string {
  return s.play_date ?? toYmd(new Date(s.created_at))
}
