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
 * Cold rows read projection-cache hints or a size-gated small-artifact
 * probe; a hint-less conversation title comes from the cache's cold ladder
 * (one log read, then persisted), never a repeated full read.
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
  await mergeColdSummaries(ctx, persistence, cold, archived, workspacePaths, summaries)
  await attachModifiedTimes(ctx, summaries)
  return summaries.sort((a, b) => sessionTime(b) - sessionTime(a))
}

interface ColdHeader {
  id: string
  cwd?: string
  createdAt: number
  origin?: string
}

interface SessionQueryLike {
  listSessions?(signal?: AbortSignal): Promise<Array<{ header: ColdHeader; live: boolean; persisted: boolean }>>
}

interface ProjectionCacheLike {
  cachedSnapshot?(meta: ColdHeader): { asOfSeq: number; values: Record<string, unknown> } | undefined
  coldSnapshot?(id: string, signal?: AbortSignal): Promise<{ asOfSeq: number; values: Record<string, unknown> } | undefined>
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

interface PersistenceLike {
  list(signal?: AbortSignal): Promise<ColdHeader[]>
  locate?(header: { cwd?: string; id: string }): { path: string } | undefined
  readFrom?(id: string, offset: number, signal?: AbortSignal): Promise<{ events: SessionEvent[] }>
}

interface SessionMetaCacheEntry {
  title: string | undefined
  blank: boolean | undefined
  promptAt: number
}

const SESSION_META_CACHE_MAX = 512
const sessionMetaCache = new Map<string, SessionMetaCacheEntry>()

function cacheSessionMeta(id: string, entry: SessionMetaCacheEntry): void {
  while (sessionMetaCache.size >= SESSION_META_CACHE_MAX) {
    const oldest = sessionMetaCache.keys().next()
    if (oldest.done) break
    sessionMetaCache.delete(oldest.value)
  }
  sessionMetaCache.set(id, entry)
}

const PROBE_BATCH_SIZE = 16

/** Mirrors the host's cold blank-probe gate: only small artifacts are read. */
const COLD_PROBE_MAX_BYTES = 1024

interface ColdMeta {
  title: string | undefined
  blank: boolean
  promptAt: number
}

function listMetadataHint(values: Record<string, unknown>): { blank: boolean; lastPromptAt: number | null } | undefined {
  const hint = values.sessionListMetadata as { blank?: unknown; lastPromptAt?: unknown } | undefined
  if (typeof hint?.blank !== 'boolean') return undefined
  return {
    blank: hint.blank,
    lastPromptAt: typeof hint.lastPromptAt === 'number' ? hint.lastPromptAt : null,
  }
}

/**
 * Cold-session metadata without unconditional full-log reads: projection
 * hints first (zero I/O), then a direct read only when the artifact is small
 * enough to be a blank-session log. A hint-less oversized artifact is
 * conservatively visible; its title comes from the projection cache's cold
 * ladder, which reads the log once and writes the row back durably.
 */
async function resolveColdMeta(cache: ProjectionCacheLike | undefined, persistence: PersistenceLike, header: ColdHeader): Promise<ColdMeta> {
  let titleHint: string | undefined
  let metadata: { blank: boolean; lastPromptAt: number | null } | undefined
  try {
    const values = cache?.cachedSnapshot?.(header)?.values ?? {}
    if (typeof values.title === 'string' && values.title !== '') titleHint = values.title
    metadata = listMetadataHint(values)
  } catch {
    // A broken projection cache must not block the session picker; fall back to probing.
  }
  if (metadata?.blank === false) {
    return { title: await coldTitle(cache, header, titleHint), blank: false, promptAt: metadata.lastPromptAt ?? 0 }
  }
  const probed = await probeSmallArtifact(persistence, header)
  if (probed !== undefined) {
    return { title: probed.title ?? titleHint, blank: probed.blank, promptAt: probed.promptAt }
  }
  return { title: await coldTitle(cache, header, titleHint), blank: false, promptAt: metadata?.lastPromptAt ?? 0 }
}

async function coldTitle(cache: ProjectionCacheLike | undefined, header: ColdHeader, titleHint: string | undefined): Promise<string | undefined> {
  if (titleHint !== undefined || cache?.coldSnapshot === undefined) return titleHint
  try {
    const snapshot = await cache.coldSnapshot(String(header.id))
    const title = snapshot?.values?.title
    return typeof title === 'string' && title !== '' ? title : undefined
  } catch {
    // A failed cold-snapshot read leaves the session without a title.
    return undefined
  }
}

async function probeSmallArtifact(persistence: PersistenceLike, header: ColdHeader): Promise<ColdMeta | undefined> {
  if (persistence.locate === undefined || persistence.readFrom === undefined) return undefined
  const location = persistence.locate(header)
  if (location === undefined) return undefined
  try {
    const info = await stat(location.path)
    if (info.size > COLD_PROBE_MAX_BYTES) return undefined
    const { events } = await persistence.readFrom(String(header.id), 0)
    return { blank: isBlankSession(events), title: titleFromEvents(events) ?? firstUserText(events), promptAt: lastPromptAt(events) }
  } catch {
    // An unreadable artifact is treated as a blank session (skipped in the list).
    return undefined
  }
}

async function mergeColdSummaries(
  ctx: Context,
  persistence: PersistenceLike | undefined,
  cold: ColdHeader[],
  archived: ReadonlySet<string>,
  workspacePaths: ReadonlySet<string>,
  summaries: SessionSummary[],
): Promise<void> {
  if (persistence === undefined) return
  const cache = ctx.get('sessionProjectionCache') as ProjectionCacheLike | undefined
  const pending: ColdHeader[] = []
  for (const header of cold) {
    if (archived.has(String(header.id))) continue
    const cached = sessionMetaCache.get(String(header.id))
    if (cached !== undefined && cached.blank !== undefined) {
      if (!cached.blank) {
        summaries.push(toSummary(String(header.id), cached.title, header.cwd, header.createdAt, cached.promptAt, workspacePaths))
      }
      continue
    }
    pending.push(header)
  }
  for (let index = 0; index < pending.length; index += PROBE_BATCH_SIZE) {
    await Promise.all(pending.slice(index, index + PROBE_BATCH_SIZE).map(async header => {
      const meta = await resolveColdMeta(cache, persistence, header)
      cacheSessionMeta(String(header.id), meta)
      if (!meta.blank) {
        summaries.push(toSummary(String(header.id), meta.title, header.cwd, header.createdAt, meta.promptAt, workspacePaths))
      }
    }))
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