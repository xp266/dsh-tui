import type { Context } from '@deepseek-ai/cordis'
import { stat } from 'node:fs/promises'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import {
  addDeepSeekKey,
  fetchCustomModels,
  listConfiguredModels,
  saveCustomProvider,
  selectModel,
} from './models.ts'
import type { ConfiguredModel, CustomProviderForm } from './models.ts'

export interface SessionSummary {
  id: string
  name: string
  directory: string
  createdAt: number
}

export interface ChatBridge {
  modelName(): string
  send(text: string): void
  subscribe(handler: (event: SessionEvent) => void): () => void
  listSessions(): Promise<SessionSummary[]>
  openSession(id: string): Promise<void>
  newSession(): Promise<void>
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
}

interface ResolvedModel {
  provider?: string
  model?: string
  display: string
}

let sessionCounter = 0

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
const SESSION_LIST_REFRESH_MIN_MS = 2000

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

async function computeSessionList(ctx: Context): Promise<SessionSummary[]> {
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

export async function createChatBridge(ctx: Context): Promise<ChatBridge> {
  const model = await resolveModel(ctx)
  const modelOptions: AgentOptions = model.provider === undefined ? {} : { provider: model.provider, model: model.model }
  const handlers = new Set<(event: SessionEvent) => void>()
  let activeHandle: AgentHandle | undefined = await createAgent(process.cwd())
  let activeAgent = activeHandle.agent
  const llm = ctx.llm
  let sessionListCache: SessionSummary[] | undefined
  let sessionListRefresh: Promise<void> | undefined
  let sessionListRefreshAt = 0

  function emit(event: SessionEvent): void {
    for (const handler of [...handlers]) handler(event)
  }

  ctx.on('session/event', (session, event) => {
    if (session.id !== activeAgent.id) return
    const type = (event as { type?: string }).type
    if (type === 'session/title' || type === 'turn/start') void refreshSessionList()
    emit(event)
  })

  async function createAgent(cwd: string): Promise<AgentHandle> {
    if (typeof ctx.agentLoop.createAgent === 'function') {
      return ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId(`tui-${Date.now()}-${++sessionCounter}`),
        meta: { cwd },
        agentOptions: modelOptions,
      })
    }
    const agent = ctx.agentLoop.create(
      SessionId(`tui-${Date.now()}-${++sessionCounter}`),
      modelOptions,
      { cwd },
    )
    return {
      agent,
      dispose: async () => {
        agent.cancel({ kind: 'disposed' })
        await agent.whenIdle()
      },
    }
  }

  async function resumeAgent(id: string): Promise<AgentHandle> {
    const query = ctx.get('sessionQuery') as SessionQueryLike | undefined
    if (typeof ctx.agentLoop.resume === 'function') {
      try {
        return await ctx.agentLoop.resume(ctx, { resumeSessionId: SessionId(id), agentOptions: modelOptions })
      } catch (error) {
        if (query?.readSession === undefined) throw error
        const snapshot = await query.readSession(String(id))
        return ctx.agentLoop.createAgent(ctx, {
          sessionId: SessionId(id),
          seed: snapshot.events,
          meta: { cwd: snapshot.session.cwd },
          agentOptions: modelOptions,
        })
      }
    }
    if (query?.readSession !== undefined) {
      const snapshot = await query.readSession(String(id))
      return ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId(id),
        seed: snapshot.events,
        meta: { cwd: snapshot.session.cwd },
        agentOptions: modelOptions,
      })
    }
    throw new Error('cannot resume session: session persistence is not configured')
  }

  async function openSession(id: string): Promise<void> {
    const sessionId = SessionId(id)
    if (activeAgent.id === sessionId) return
    const existing = ctx.agents.get(sessionId)
    if (existing !== undefined) {
      const previous = activeHandle
      activeHandle = undefined
      activeAgent = existing
      if (previous !== undefined) await previous.dispose()
      for (const event of activeAgent.session.events) emit(event)
      return
    }
    const handle = await resumeAgent(sessionId)
    const previous = activeHandle
    activeHandle = handle
    activeAgent = handle.agent
    if (previous !== undefined) await previous.dispose()
    for (const event of activeAgent.session.events) emit(event)
  }

  async function newSession(): Promise<void> {
    const handle = await createAgent(process.cwd())
    const previous = activeHandle
    activeHandle = handle
    activeAgent = handle.agent
    if (previous !== undefined) await previous.dispose()
  }

  async function listSessions(): Promise<SessionSummary[]> {
    if (sessionListCache !== undefined) {
      void refreshSessionList()
      return sessionListCache
    }
    await refreshSessionList(true)
    return sessionListCache ?? []
  }

  async function refreshSessionList(force = false): Promise<void> {
    const now = Date.now()
    if (!force && sessionListRefreshAt > now - SESSION_LIST_REFRESH_MIN_MS) return
    if (sessionListRefresh !== undefined) return sessionListRefresh
    sessionListRefresh = computeSessionList(ctx)
      .then(records => {
        sessionListCache = records
        sessionListRefreshAt = Date.now()
      })
      .catch(() => {})
      .finally(() => {
        sessionListRefresh = undefined
      })
    return sessionListRefresh
  }

  void refreshSessionList(true)

  return {
    modelName: () => model.display,
    send(text: string) {
      activeAgent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    subscribe(handler: (event: SessionEvent) => void) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    listSessions,
    openSession,
    newSession,
    listModels: () => listConfiguredModels(llm),
    selectModel: (provider, name) => selectModel(ctx.agentDefaultModel, provider, name),
    addDeepSeekKey: key => addDeepSeekKey(ctx.credentials, key),
    fetchCustomModels: form => fetchCustomModels(llm, form),
    saveCustomProvider: (form, models) => saveCustomProvider(ctx.settings, ctx.credentials, form, models),
  }
}

function compareSessions(a: SessionSummary, b: SessionSummary): number {
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

function textFromBlocks(blocks: readonly { type: string; text?: string; content?: readonly unknown[] }[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text' && block.text !== undefined) text += block.text
    else if (block.type === 'tool-result' && Array.isArray(block.content)) {
      text += textFromBlocks(block.content as readonly { type: string; text?: string; content?: readonly unknown[] }[])
    }
  }
  return text
}

async function resolveModel(ctx: Context): Promise<ResolvedModel> {
  const llm = ctx.get('llm')
  if (llm) {
    const glm = await findGlmModel(llm)
    if (glm !== undefined) return glm
  }
  const selection = ctx.get('agentDefaultModel')?.currentSelection()
  if (selection) return { provider: selection.provider, model: selection.model, display: selection.model }
  return { display: 'glm 4.7' }
}

async function findGlmModel(llm: LlmRuntime): Promise<ResolvedModel | undefined> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      for (const provider of llm.listProviders()) {
        const models = await llm.listModels(provider.id)
        const hit = models.find(m => /glm/i.test(m.id))
        if (hit !== undefined) return { provider: provider.id, model: hit.id, display: hit.id }
      }
    } catch {
      // provider registry still settling from the settings document; retry
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return undefined
}
