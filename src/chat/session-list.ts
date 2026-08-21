import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { textFromBlocks } from './blocks.ts'
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
    if (session.header.origin === 'subagent') continue
    if (archived.has(id)) continue
    if (isBlankSession(session.events) && id !== currentId) continue
    const title = titleService?.get?.(session)?.title ?? firstUserText(session.events)
    summaries.push(toSummary(id, title, session.header.cwd, session.header.createdAt, lastPromptAt(session.events), workspacePaths))
  }
  const persistence = ctx.get('sessionPersistence') as PersistenceLike | undefined
  if (persistence !== undefined && typeof persistence.list === 'function') {
    const cold = (await persistence.list()).filter(header =>
      !attached.has(header.id) && header.cwd !== undefined && header.origin !== 'subagent')
    await mergeColdSummaries(persistence, cold, archived, workspacePaths, summaries)
  }
  await attachModifiedTimes(ctx, summaries)
  return summaries.sort((a, b) => sessionTime(b) - sessionTime(a))
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
  list(signal?: AbortSignal): Promise<Array<{ id: string; cwd?: string; createdAt: number; origin?: string }>>
  locate?(header: { cwd?: string; id: string }): { path: string } | undefined
  readFrom?(id: string, offset: number, signal?: AbortSignal): Promise<{ events: SessionEvent[] }>
}

interface SessionMetaCacheEntry {
  title: string | undefined
  blank: boolean | undefined
}

const sessionMetaCache = new Map<string, SessionMetaCacheEntry>()
const PROBE_BATCH_SIZE = 16

async function probeColdHeader(
  persistence: PersistenceLike,
  header: { id: string; cwd?: string; createdAt: number },
  workspacePaths: ReadonlySet<string>,
  summaries: SessionSummary[],
): Promise<void> {
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
  if (blank) return
  summaries.push(toSummary(header.id, title, header.cwd, header.createdAt, promptAt, workspacePaths))
}

async function mergeColdSummaries(
  persistence: PersistenceLike,
  cold: Array<{ id: string; cwd?: string; createdAt: number }>,
  archived: ReadonlySet<string>,
  workspacePaths: ReadonlySet<string>,
  summaries: SessionSummary[],
): Promise<void> {
  const pending: Array<{ id: string; cwd?: string; createdAt: number }> = []
  for (const header of cold) {
    if (archived.has(header.id)) continue
    const cached = sessionMetaCache.get(header.id)
    if (cached !== undefined && cached.blank !== undefined) {
      if (!cached.blank) {
        summaries.push(toSummary(header.id, cached.title, header.cwd, header.createdAt, header.createdAt, workspacePaths))
      }
      continue
    }
    pending.push(header)
  }
  for (let index = 0; index < pending.length; index += PROBE_BATCH_SIZE) {
    await Promise.all(pending.slice(index, index + PROBE_BATCH_SIZE).map(header =>
      probeColdHeader(persistence, header, workspacePaths, summaries)))
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