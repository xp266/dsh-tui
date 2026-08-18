import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { textFromBlocks } from './blocks.ts'

export interface SessionSummary {
  id: string
  name: string
  directory: string
  createdAt: number
}

interface SessionRecordLike {
  header: { id: string; createdAt: number; cwd?: string; origin?: 'subagent' }
  live: boolean
  persisted: boolean
}

interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<SessionRecordLike[]>
  filterSessions?(filters: readonly { kind: 'cwd'; values: readonly (string | null)[] }[], signal?: AbortSignal): Promise<SessionRecordLike[]>
  readSession?(id: string): Promise<{ session: { cwd?: string }; events: SessionEvent[] }>
  readTitleSnapshots?(ids: readonly SessionId[]): Promise<Array<{
    sessionId: SessionId
    status: 'fulfilled' | 'rejected'
    value?: { title?: { title?: string } }
  }>>
}

interface SessionMetaCacheEntry {
  title: string | undefined
  blank: boolean | undefined
}

const sessionMetaCache = new Map<string, SessionMetaCacheEntry>()
const BLANK_PROBE_MAX_BYTES = 1024

async function isSmallLog(
  ctx: Context,
  header: { cwd?: string; id: string },
): Promise<boolean> {
  const persistence = ctx.get('sessionPersistence') as { locate?(header: { cwd?: string; id: string }): { path: string } | undefined } | undefined
  try {
    const location = persistence?.locate?.(header)
    if (location === undefined) return false
    const size = (await stat(location.path)).size
    return size <= BLANK_PROBE_MAX_BYTES
  } catch {
    return false
  }
}

export async function computeSessionList(ctx: Context): Promise<SessionSummary[]> {
  const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
  const workspace = ctx.get('workspaceRegistry') as {
    archivedSessionIds: readonly string[]
    list?(): Array<{ path: string }>
  } | undefined
  const sessionTitleService = ctx.get('sessionTitle') as { get?(session: { id: string; events: readonly SessionEvent[] }): { title?: string } | undefined } | undefined
  let archived = new Set<string>()
  try {
    archived = new Set(workspace?.archivedSessionIds ?? [])
  } catch {
    archived = new Set()
  }
  let workspacePaths = new Set<string>()
  try {
    workspacePaths = new Set(workspace?.list?.().map(entry => entry.path) ?? [])
  } catch {
    workspacePaths = new Set()
  }
  if (workspacePaths.size === 0) workspacePaths = new Set([process.cwd()])
  if (query === undefined || typeof query.listSessions !== 'function') {
    return ctx.sessions
      .list()
      .filter(session => {
        if (archived.has(String(session.id))) return false
        if (session.header.origin === 'subagent') return false
        if (session.header.cwd === undefined || !workspacePaths.has(session.header.cwd)) return false
        const blank = !session.events.some(event => event.type === 'turn/start')
        return !blank
      })
      .map(session => ({
        id: String(session.id),
        name: titleFromEvents(session.events) ?? firstUserText(session.events) ?? fallbackName(String(session.id), session.header.cwd),
        directory: session.header.cwd ?? '',
        createdAt: session.header.createdAt,
      }))
      .sort(compareSessions)
  }
  const allRecords = typeof query.filterSessions === 'function'
    ? await query.filterSessions([{ kind: 'cwd', values: [...workspacePaths] }])
    : await query.listSessions()
  const titleBySession = new Map<string, string>()
  const smallRecords: SessionRecordLike[] = []
  const largeRecords: SessionRecordLike[] = []
  const kept: SessionRecordLike[] = []
  for (const record of allRecords) {
    if (archived.has(record.header.id)) continue
    if (record.header.origin === 'subagent') continue
    if (record.header.cwd === undefined || !workspacePaths.has(record.header.cwd)) continue
    const live = ctx.sessions.get(SessionId(record.header.id))
    if (live !== undefined) {
      const blank = !live.events.some(event => event.type === 'turn/start')
      if (blank) continue
      const title = sessionTitleService?.get?.(live)?.title ?? titleFromEvents(live.events)
      if (title !== undefined && title !== '') titleBySession.set(record.header.id, title)
      kept.push(record)
      continue
    }
    const cached = sessionMetaCache.get(record.header.id)
    if (cached !== undefined && cached.blank !== undefined) {
      if (cached.blank) continue
      if (cached.title !== undefined && cached.title !== '') titleBySession.set(record.header.id, cached.title)
      kept.push(record)
      continue
    }
    if (cached !== undefined && cached.title !== undefined && cached.title !== '') {
      if (!(await isSmallLog(ctx, record.header))) {
        titleBySession.set(record.header.id, cached.title)
        kept.push(record)
        continue
      }
    }
    if (await isSmallLog(ctx, record.header)) smallRecords.push(record)
    else largeRecords.push(record)
  }
  for (const record of smallRecords) {
    let blank = false
    let title: string | undefined
    if (query.readSession !== undefined) {
      try {
        const snapshot = await query.readSession(String(record.header.id))
        blank = !snapshot.events.some(event => event.type === 'turn/start')
        title = titleFromEvents(snapshot.events)
      } catch {
        blank = false
      }
    }
    sessionMetaCache.set(record.header.id, { title, blank })
    if (blank) continue
    if (title !== undefined && title !== '') titleBySession.set(record.header.id, title)
    kept.push(record)
  }
  if (query.readTitleSnapshots !== undefined && largeRecords.length > 0) {
    const results = await query.readTitleSnapshots(largeRecords.map(record => SessionId(record.header.id)))
    for (let i = 0; i < largeRecords.length; i++) {
      const record = largeRecords[i]!
      const result = results[i]
      const snapshot = result?.status === 'fulfilled' ? result.value?.title : undefined
      const title = snapshot !== undefined && snapshot.title !== undefined && snapshot.title !== ''
        ? snapshot.title
        : undefined
      sessionMetaCache.set(record.header.id, { title, blank: undefined })
      if (title !== undefined) titleBySession.set(record.header.id, title)
      kept.push(record)
    }
  }
  return kept
    .map(record => ({
      id: record.header.id,
      name: titleBySession.get(record.header.id) ?? fallbackName(record.header.id, record.header.cwd),
      directory: record.header.cwd ?? '',
      createdAt: record.header.createdAt,
    }))
    .sort(compareSessions)
}

export function compareSessions(a: SessionSummary, b: SessionSummary): number {
  const dir = (a.directory ?? '').localeCompare(b.directory ?? '')
  if (dir !== 0) return dir
  return b.createdAt - a.createdAt
}

function fallbackName(id: string, directory?: string): string {
  if (directory !== undefined && directory !== '') {
    const base = directory.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
    if (base !== undefined && base !== '') return base
  }
  const match = id.match(/[^/]+$/)
  return match?.[0] ?? id
}

function titleFromEvents(events: readonly SessionEvent[]): string | undefined {
  let title: string | undefined
  for (const event of events) {
    if ((event as { type?: string }).type === 'session/title') {
      const data = (event as { data?: { title?: string } }).data
      if (data?.title !== undefined && data.title !== '') title = data.title
    }
  }
  return title
}

function firstUserText(events: readonly SessionEvent[]): string | undefined {
  for (const event of events) {
    if (event.type !== 'user/message') continue
    if (event.data.source.kind !== 'user') continue
    const text = textFromBlocks(event.data.content)
    if (text.trim() !== '') return text
  }
  return undefined
}