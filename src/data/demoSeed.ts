import type { Attendance, Expense, ExpenseShare, Member, Payment, Session, Settings, Sport } from '@/types'
import { computeDues } from '@/lib/balance'
import { toYmd } from '@/lib/format'
import { AVATAR_COLORS } from '@/lib/avatar'

export interface DemoDb {
  settings: Settings
  sports: Sport[]
  members: Member[]
  sessions: Session[]
  attendances: Attendance[]
  expenses: Expense[]
  shares: ExpenseShare[]
  payments: Payment[]
}

/** 固定種子的亂數，讓每次重置都得到同樣分布的示範資料 */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomHex(bytes: number): string {
  // crypto.randomUUID 只在安全來源可用，用區網 IP 開 dev server 時會不存在
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomId(): string {
  const h = randomHex(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function randomToken(): string {
  return randomHex(16)
}

const NAMES = ['孟穎', '志豪', '佳蓉', '冠廷', '雅婷', '柏翰', '思妤', '承恩', '怡君', '家豪', '宜庭', '俊宏']
const PICKLE_GROUP = ['孟穎', '志豪', '佳蓉', '冠廷', '雅婷', '柏翰', '思妤', '承恩']
const BADMINTON_GROUP = ['雅婷', '柏翰', '孟穎', '怡君', '家豪', '宜庭', '俊宏']

export function createDemoDb(today = new Date()): DemoDb {
  const rand = mulberry32(20261001)
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const at = (daysAgo: number, hour = 20) => {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const iso = (d: Date) => d.toISOString()

  const sports: Sport[] = [
    {
      id: randomId(),
      name: '匹克球',
      emoji: '🏓',
      color: '#9fcc12',
      default_expenses: [{ label: '場地費', amount: 1000 }],
      sort_order: 0,
      active: true,
      created_at: iso(at(130)),
    },
    {
      id: randomId(),
      name: '羽球',
      emoji: '🏸',
      color: '#38bdf8',
      default_expenses: [
        { label: '場地費', amount: 1200 },
        { label: '羽球', amount: null },
      ],
      sort_order: 1,
      active: true,
      created_at: iso(at(130)),
    },
  ]
  const [pickleball, badminton] = sports

  const members: Member[] = NAMES.map((name, i) => ({
    id: randomId(),
    name,
    color: AVATAR_COLORS[(i * 5) % AVATAR_COLORS.length],
    active: true,
    sort_order: i,
    created_at: iso(at(120 - i)),
  }))
  const archived: Member = {
    id: randomId(),
    name: '阿哲',
    color: AVATAR_COLORS[11],
    active: false,
    sort_order: members.length,
    created_at: iso(at(118)),
  }
  members.push(archived)
  const byName = (n: string) => members.find((m) => m.name === n)!

  const sessions: Session[] = []
  const attendances: Attendance[] = []
  const expenses: Expense[] = []
  const shares: ExpenseShare[] = []
  const payments: Payment[] = []

  const addPayment = (from: Member, to: Member, amount: number, paidAt: Date, sessionId: string | null, note = '') => {
    payments.push({
      id: randomId(),
      from_member_id: from.id,
      to_member_id: to.id,
      amount,
      paid_at: iso(paidAt),
      session_id: sessionId,
      note,
      created_at: iso(paidAt),
    })
  }

  /** payProb：每位分攤者在同場直接付清的機率；另有小機率只付一半 */
  const addExpense = (session: Session, label: string, amount: number, payer: Member, participants: Member[], payProb: number, ageDays: number) => {
    const expense: Expense = { id: randomId(), session_id: session.id, label, amount, payer_member_id: payer.id, created_at: session.created_at }
    expenses.push(expense)
    const { shares: dues } = computeDues(amount, participants.map((p) => p.id))
    for (const due of dues) {
      shares.push({ ...due, expense_id: expense.id })
      if (due.member_id === payer.id) continue
      const r = rand()
      const paidAt = at(Math.max(0, ageDays - 1 - Math.floor(rand() * 3)), 22)
      const from = members.find((m) => m.id === due.member_id)!
      if (r < payProb) addPayment(from, payer, due.amount_due, paidAt, session.id)
      else if (r < payProb + 0.12) addPayment(from, payer, Math.round(due.amount_due / 20) * 10, paidAt, session.id, '先付一半')
    }
  }

  const addSession = (sport: Sport, age: number, group: string[], extra: Partial<Session> = {}) => {
    const date = at(age)
    const pool = group.map(byName).concat(age > 70 ? [archived] : [])
    const attendees = pool.filter(() => rand() < 0.78)
    while (attendees.length < 4) {
      const m = pick(pool)
      if (!attendees.includes(m)) attendees.push(m)
    }
    const session: Session = {
      id: randomId(),
      sport_id: sport.id,
      play_date: toYmd(date),
      title: null,
      location: null,
      note: '',
      locked: age > 50,
      created_at: iso(date),
      ...extra,
    }
    sessions.push(session)
    attendees.forEach((m) => attendances.push({ session_id: session.id, member_id: m.id }))
    return { session, attendees, payProb: age > 45 ? 1 : age > 20 ? 0.7 : age > 7 ? 0.4 : 0.12 }
  }

  const pickleAges = [3, 10, 17, 24, 38, 52, 66, 80]
  const pickleCourts = ['大安運動中心', '內湖運動中心', '南港運動中心']
  const picklePayers = ['孟穎', '志豪', '佳蓉', '冠廷'].map(byName)
  pickleAges.forEach((age, i) => {
    const extra = i === 3 ? { title: '中秋友誼賽', note: '賽後飲料由承恩先墊' } : {}
    const { session, attendees, payProb } = addSession(pickleball, age, PICKLE_GROUP, { location: pick(pickleCourts), ...extra })
    const payer = attendees.includes(picklePayers[i % 4]) ? picklePayers[i % 4] : attendees[0]
    addExpense(session, '場地費', pick([800, 1000, 1200, 960]), payer, attendees, payProb, age)
    if (i % 3 === 1) {
      const ballPayer = attendees.find((m) => m.name === '柏翰') ?? attendees[1]
      addExpense(session, '比賽用球 6 顆', 540, ballPayer, attendees, payProb, age)
    }
    if (i === 3) {
      addExpense(session, '飲料', 385, byName('承恩'), attendees.slice(0, Math.max(3, attendees.length - 2)), payProb, age)
    }
  })

  const badmintonAges = [6, 20, 34, 48, 75]
  const badmintonPayers = ['怡君', '家豪'].map(byName)
  badmintonAges.forEach((age, i) => {
    const { session, attendees, payProb } = addSession(badminton, age, BADMINTON_GROUP, { location: '信義運動中心' })
    const payer = attendees.includes(badmintonPayers[i % 2]) ? badmintonPayers[i % 2] : attendees[0]
    addExpense(session, '場地費', pick([1200, 1400]), payer, attendees, payProb, age)
    if (i % 2 === 0) {
      const shuttlePayer = attendees.find((m) => m.name === '俊宏') ?? attendees[0]
      addExpense(session, '羽球 1 打', 650, shuttlePayer, attendees, payProb, age)
    }
  })

  const feeDate = at(40)
  const feeSession: Session = {
    id: randomId(),
    sport_id: null,
    play_date: null,
    title: '2026 下半年球隊年費',
    location: null,
    note: '含球網、計分板與保險，每人 500',
    locked: false,
    created_at: iso(feeDate),
  }
  sessions.push(feeSession)
  const active = members.filter((m) => m.active)
  active.forEach((m) => attendances.push({ session_id: feeSession.id, member_id: m.id }))
  addExpense(feeSession, '年費', 500 * active.length, byName('孟穎'), active, 0.5, 40)

  addPayment(byName('思妤'), byName('志豪'), 300, at(12, 21), null, '上次一起結')
  addPayment(byName('宜庭'), byName('怡君'), 200, at(15, 21), null, '轉帳')

  return {
    settings: { team_name: '球友記帳', team_token: randomToken(), updated_at: iso(today) },
    sports,
    members,
    sessions,
    attendances,
    expenses,
    shares,
    payments,
  }
}
