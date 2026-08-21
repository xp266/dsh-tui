import type { SessionSummary } from './session-list.ts'
import { sessionTime } from './session-list.ts'

export type SessionSectionKind = 'recent' | 'today' | 'week' | 'older'

export interface SessionSection {
  kind: SessionSectionKind
  items: SessionSummary[]
}

const RECENT_LIMIT = 5
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function startOfDay(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function groupSessions(items: readonly SessionSummary[], now: number = Date.now()): SessionSection[] {
  const sorted = [...items].sort((a, b) => sessionTime(b) - sessionTime(a))
  if (sorted.length === 0) return []
  const sections: SessionSection[] = [{ kind: 'recent', items: sorted.slice(0, RECENT_LIMIT) }]
  const todayStart = startOfDay(now)
  const weekStart = todayStart - WEEK_MS
  const buckets: Record<Exclude<SessionSectionKind, 'recent'>, SessionSummary[]> = { today: [], week: [], older: [] }
  for (const session of sorted) {
    const time = sessionTime(session)
    if (time >= todayStart) buckets.today.push(session)
    else if (time >= weekStart) buckets.week.push(session)
    else buckets.older.push(session)
  }
  for (const kind of ['today', 'week', 'older'] as const) {
    if (buckets[kind].length > 0) sections.push({ kind, items: buckets[kind] })
  }
  return sections
}
