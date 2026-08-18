import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { LlmDiscoveredModel, LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  addDeepSeekKey,
  fetchCustomModels,
  listConfiguredModels,
  saveCustomProvider,
  selectModel,
} from './models.ts'
import type { ConfiguredModel, CustomProviderForm } from './models.ts'
import { computeSessionList } from './session-list.ts'
import type { SessionSummary } from './session-list.ts'

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

const SESSION_LIST_REFRESH_MIN_MS = 2000

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
    const query = ctx.get('sessionQuery') as {
      readSession?(id: string): Promise<{ session: { cwd?: string }; events: SessionEvent[] }>
    } | undefined
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
    if (activeAgent.id === sessionId) {
      for (const event of activeAgent.session.events) emit(event)
      return
    }
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
    await refreshSessionList(true)
    return sessionListCache ?? []
  }

  async function refreshSessionList(force = false): Promise<void> {
    const now = Date.now()
    if (!force && sessionListRefreshAt > now - SESSION_LIST_REFRESH_MIN_MS) return
    if (sessionListRefresh !== undefined) return sessionListRefresh
    sessionListRefresh = computeSessionList(ctx, String(activeAgent.id))
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