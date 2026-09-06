import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { textFromBlocks } from './blocks.ts'
import { error as logError } from '../log.ts'
import { isBlankSession } from './presets.ts'

export interface SessionSummary {
  id: string
  name: string
  directory: string
  ungrouped: boolean
  updatedAt: number
  modifiedAt?: number
}

export function sessionTime(session: SessionSummary): number {
  return session.modifiedAt ?? session.updatedAt
}

/**
 * Session picker data, mirroring the Host's `listVisibleSessionSummaries`
 * with the client-side visibility rules: live sessions plus persisted cold
 * sessions with a cwd, blank and subagent-origin rows hidden, newest-first,
 * without any workspace filtering (the picker labels ungrouped sessions).
 * Cold rows take their titles from the host's batched session-title fold
 * (`sessionQuery.readTitleSnapshots`), which reads each log once per
 * release of the query corpus and never loads full sessions into memory.
 */
export async function computeSessionList(ctx: Context): Promise<SessionSummary[]> {
  try {
    return await computeSessionListInner(ctx)
  } catch (error) {
    logError('boot', `session list failed: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

async function computeSessionListInner(ctx: Context): Promise<SessionSummary[]> {
  const workspacePaths = collectWorkspacePaths(ctx)
  const archived = collectArchivedIds(ctx)
  const summaries: SessionSummary[] = []
  const attached = new Set<string>()
  const titleService = ctx.get('sessionTitle') as
    | { get?(session: { id: string; snapshotEvents(): readonly SessionEvent[] }): { title?: string } | undefined }
    | undefined
  for (const session of ctx.sessions.list()) {
    const id = String(session.id)
    attached.add(id)
    if (session.header.origin === 'subagent') continue
    if (archived.has(id)) continue
    if (isBlankSession(session.snapshotEvents())) continue
    const title = titleService?.get?.(session)?.title ?? firstUserText(session.snapshotEvents())
    summaries.push(toSummary(id, title, session.header.cwd, session.header.createdAt, lastPromptAt(session.snapshotEvents()), workspacePaths))
  }
  const persistence = ctx.get('sessionPersistence') as PersistenceLike | undefined
  const cold = await listColdHeaders(ctx, persistence, attached)
  await mergeColdSummaries(ctx, cold, archived, workspacePaths, summaries)
  await attachModifiedTimes(ctx, summaries)
  return summaries.sort((a, b) => sessionTime(b) - sessionTime(a))
}

interface ColdHeader {
  id: string
  cwd?: string
  createdAt: number
  origin?: string
}

interface PersistenceLike {
  list(signal?: AbortSignal): Promise<ColdHeader[]>
  locate?(header: { cwd?: string; id: string }): { path: string } | undefined
}

interface SessionQueryLike {
  listSessions?(signal?: AbortSignal): Promise<Array<{ header: ColdHeader; live: boolean; persisted: boolean }>>
  readTitleSnapshots?(sessionIds: readonly string[]): Promise<Array<{
    sessionId: string
    status: 'fulfilled' | 'rejected'
    value?: { title?: { title?: string; updatedAt?: number } }
  }>>
}

/**
 * Cold-session headers from the official query corpus (`sessionQuery`,
 * live-preferred, zero log reads), falling back to `persistence.list()`
 * (first-line header reads) when the query service is not mounted.
 */
async function listColdHeaders(ctx: Context, persistence: PersistenceLike | undefined, attached: ReadonlySet<string>): Promise<ColdHeader[]> {
  const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
  if (query?.listSessions !== undefined) {
    const records = await query.listSessions()
    return records
      .filter(record => !record.live && record.persisted && !attached.has(String(record.header.id)))
      .filter(record => record.header.cwd !== undefined && record.header.origin !== 'subagent')
      .map(record => record.header)
  }
  if (persistence?.list !== undefined) {
    const headers = await persistence.list()
    return headers.filter(header => !attached.has(String(header.id)) && header.cwd !== undefined && header.origin !== 'subagent')
  }
  return []
}

async function attachModifiedTimes(ctx: Context, summaries: SessionSummary[]): Promise<void> {
  const persistence = ctx.get('sessionPersistence') as PersistenceLike | undefined
  const locate = persistence?.locate
  if (locate === undefined) return
  await Promise.all(summaries.map(async summary => {
    try {
      const location = locate({ id: summary.id, cwd: summary.directory === '' ? undefined : summary.directory })
      if (location === undefined) return
      const info = await stat(location.path)
      summary.modifiedAt = Math.floor(info.mtimeMs)
    } catch {
      // A missing or unreadable session artifact keeps the updatedAt timestamp.
    }
  }))
}

function toSummary(
  id: string,
  title: string | undefined,
  cwd: string | undefined,
  createdAt: number,
  updatedAt: number,
  workspacePaths: ReadonlySet<string>,
): SessionSummary {
  return {
    id,
    name: title ?? fallbackName(id, cwd),
    directory: cwd ?? '',
    ungrouped: cwd === undefined || !workspacePaths.has(cwd),
    updatedAt: Math.max(createdAt, updatedAt),
  }
}

function collectWorkspacePaths(ctx: Context): Set<string> {
  const workspace = ctx.get('workspaceRegistry') as { list?(): Array<{ path: string }> } | undefined
  try {
    const paths = new Set(workspace?.list?.().map(entry => entry.path) ?? [])
    return paths.size > 0 ? paths : new Set([process.cwd()])
  } catch {
    // Without a readable workspace list every session is treated as ungrouped.
    return new Set([process.cwd()])
  }
}

function collectArchivedIds(ctx: Context): Set<string> {
  const workspace = ctx.get('workspaceRegistry') as { archivedSessionIds?: readonly unknown[] } | undefined
  try {
    return new Set((workspace?.archivedSessionIds ?? []).map(String))
  } catch {
    // Without a readable archive list no session is hidden.
    return new Set()
  }
}

function lastPromptAt(events: readonly SessionEvent[]): number {
  let last = 0
  for (const event of events) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') last = event.time
  }
  return last
}

async function mergeColdSummaries(
  ctx: Context,
  cold: ColdHeader[],
  archived: ReadonlySet<string>,
  workspacePaths: ReadonlySet<string>,
  summaries: SessionSummary[],
): Promise<void> {
  const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
  if (query?.readTitleSnapshots === undefined) return
  const observed = await query.readTitleSnapshots(cold.map(header => String(header.id))).catch(() => [])
  const titleById = new Map<string, { title: string; promptAt: number }>()
  for (const entry of observed) {
    if (entry.status !== 'fulfilled') continue
    const snapshot = entry.value?.title
    if (snapshot?.title === undefined || snapshot.title === '') continue
    titleById.set(String(entry.sessionId), { title: snapshot.title, promptAt: snapshot.updatedAt ?? 0 })
  }
  for (const header of cold) {
    if (archived.has(String(header.id))) continue
    // No title snapshot means the session never ran a turn: the host's
    // deterministic fallback titles every session with a user message.
    const meta = titleById.get(String(header.id))
    if (meta === undefined) continue
    summaries.push(toSummary(String(header.id), meta.title, header.cwd, header.createdAt, meta.promptAt, workspacePaths))
  }
}

function fallbackName(id: string, directory?: string): string {
  if (directory !== undefined && directory !== '') {
    const base = directory.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
    if (base !== undefined && base !== '') return base
  }
  const match = id.match(/[^/]+$/)
  return match?.[0] ?? id
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