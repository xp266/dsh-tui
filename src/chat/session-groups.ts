import type { SessionSummary } from './session-list.ts'
import { sessionTime } from './session-list.ts'

export type SessionSectionKind = 'recent' | 'week' | 'older'

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
  const weekStart = startOfDay(now) - WEEK_MS
  const buckets: Record<Exclude<SessionSectionKind, 'recent'>, SessionSummary[]> = { week: [], older: [] }
  for (const session of sorted) {
    if (sessionTime(session) >= weekStart) buckets.week.push(session)
    else buckets.older.push(session)
  }
  for (const kind of ['week', 'older'] as const) {
    if (buckets[kind].length > 0) sections.push({ kind, items: buckets[kind] })
  }
  return sections
}
