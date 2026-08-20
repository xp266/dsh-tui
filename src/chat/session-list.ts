import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { textFromBlocks } from './blocks.ts'
import { isBlankSession } from './presets.ts'

export interface SessionSummary {
  id: string
  name: string
  directory: string
  ungrouped: boolean
  updatedAt: number
}

/**
 * Session picker data, mirroring the Host's `listVisibleSessionSummaries`:
 * all live sessions plus persisted cold sessions with a cwd, newest-first,
 * without any workspace filtering (the picker labels ungrouped sessions).
 */
export async function computeSessionList(ctx: Context, currentId?: string): Promise<SessionSummary[]> {
  const workspacePaths = collectWorkspacePaths(ctx)
  const archived = collectArchivedIds(ctx)
  const summaries: SessionSummary[] = []
  const attached = new Set<string>()
  const titleService = ctx.get('sessionTitle') as
    | { get?(session: { id: string; events: readonly SessionEvent[] }): { title?: string } | undefined }
    | undefined
  for (const session of ctx.sessions.list()) {
    const id = String(session.id)
    attached.add(id)
    if (archived.has(id)) continue
    if (isBlankSession(session.events) && id !== currentId) continue
    const title = titleService?.get?.(session)?.title ?? firstUserText(session.events)
    summaries.push(toSummary(id, title, session.header.cwd, session.header.createdAt, lastPromptAt(session.events), workspacePaths))
  }
  const persistence = ctx.get('sessionPersistence') as PersistenceLike | undefined
  if (persistence !== undefined && typeof persistence.list === 'function') {
    const cold = (await persistence.list()).filter(header => !attached.has(header.id) && header.cwd !== undefined)
    await mergeColdSummaries(ctx, persistence, cold, archived, workspacePaths, summaries)
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt)
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
    return new Set([process.cwd()])
  }
}

function collectArchivedIds(ctx: Context): Set<string> {
  const workspace = ctx.get('workspaceRegistry') as { archivedSessionIds?: readonly unknown[] } | undefined
  try {
    return new Set((workspace?.archivedSessionIds ?? []).map(String))
  } catch {
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

interface PersistenceLike {
  list(signal?: AbortSignal): Promise<Array<{ id: string; cwd?: string; createdAt: number }>>
  locate?(header: { cwd?: string; id: string }): { path: string } | undefined
  readFrom?(id: string, offset: number, signal?: AbortSignal): Promise<{ events: SessionEvent[] }>
}

interface SessionQueryLike {
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

async function isSmallLog(ctx: Context, header: { cwd?: string; id: string }): Promise<boolean> {
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

async function mergeColdSummaries(
  ctx: Context,
  persistence: PersistenceLike,
  cold: Array<{ id: string; cwd?: string; createdAt: number }>,
  archived: ReadonlySet<string>,
  workspacePaths: ReadonlySet<string>,
  summaries: SessionSummary[],
): Promise<void> {
  const small: Array<{ id: string; cwd?: string; createdAt: number }> = []
  const large: Array<{ id: string; cwd?: string; createdAt: number }> = []
  for (const header of cold) {
    if (archived.has(header.id)) continue
    const cached = sessionMetaCache.get(header.id)
    if (cached !== undefined && cached.blank !== undefined) {
      if (!cached.blank) {
        summaries.push(toSummary(header.id, cached.title, header.cwd, header.createdAt, header.createdAt, workspacePaths))
      }
      continue
    }
    if (await isSmallLog(ctx, header)) small.push(header)
    else large.push(header)
  }
  for (const header of small) {
    let blank = false
    let title: string | undefined
    let promptAt = 0
    if (typeof persistence.readFrom === 'function') {
      try {
        const { events } = await persistence.readFrom(String(header.id), 0)
        blank = isBlankSession(events)
        title = titleFromEvents(events) ?? firstUserText(events)
        promptAt = lastPromptAt(events)
      } catch {
        blank = false
      }
    }
    sessionMetaCache.set(header.id, { title, blank })
    if (blank) continue
    summaries.push(toSummary(header.id, title, header.cwd, header.createdAt, promptAt, workspacePaths))
  }
  if (large.length === 0) return
  const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
  if (query?.readTitleSnapshots === undefined) {
    for (const header of large) {
      summaries.push(toSummary(header.id, undefined, header.cwd, header.createdAt, header.createdAt, workspacePaths))
    }
    return
  }
  const results = await query.readTitleSnapshots(large.map(header => SessionId(header.id)))
  for (let i = 0; i < large.length; i++) {
    const header = large[i]!
    const result = results[i]
    const title = result?.status === 'fulfilled' && result.value?.title?.title !== undefined && result.value.title.title !== ''
      ? result.value.title.title
      : undefined
    sessionMetaCache.set(header.id, { title, blank: undefined })
    summaries.push(toSummary(header.id, title, header.cwd, header.createdAt, header.createdAt, workspacePaths))
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