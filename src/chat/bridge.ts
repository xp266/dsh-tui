import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { resolveSessionPreset } from '@deepseek-ai/dsh-agent-presets'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, AgentOptions, ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { textFromBlocks } from './blocks.ts'
import {
  addDeepSeekKey,
  fetchCustomModels,
  fetchProviderModels,
  listConfiguredModels,
  listProviderDirectory,
  saveBuiltinProvider,
  saveCustomProvider,
} from './models.ts'
import type { ConfiguredModel, CustomProviderForm, OfficialProvider } from './models.ts'
import { formatDiffDiffs, diffLineGroups, formatReadLines, readBodyCol, relativize, summarizeOthers, summarizeParams, truncateSummary } from './tool-view.ts'
import type { DiffLike, ReadLineLike, ToolDiffView } from './tool-view.ts'
import { computeSessionList } from './session-list.ts'
import type { SessionSummary } from './session-list.ts'
import { builtInPresetName, isBlankSession, presetDisplayName } from './presets.ts'
import type { PresetSummary } from './presets.ts'
import type { EffortSummary } from './efforts.ts'
import { InteractionStore, registerInteractionChannels } from './interactions.ts'

export const DIFF_TOOL_NAMES: ReadonlySet<string> = new Set(['write', 'edit'])

export const PERMISSION_PRESETS = ['workspace-write', 'danger-full-access', 'read-only'] as const

interface PermissionPresetsLike {
  current(events: readonly SessionEvent[]): string
  set(session: Session, name: string): void
  readonly names: readonly string[]
  readonly defaultPreset: string
}

export interface TokenStats {
  input: number
  output: number
  hitPercent: number
  contextPercent: number
  projectedTokens?: number
  contextWindow?: number
}

export interface ToolResultLike {
  content: readonly ContentBlock[]
  isError: boolean
  meta?: unknown
}

export interface ToolResultPresentation {
  kind: 'replace' | 'append'
  text: string
  exitCode?: number
  signal?: string
  bodyCol?: number
  diff?: ToolDiffView
}

export interface ToolCallPresentation {
  label: string
  body: string
  bodyCol?: number
  diff?: ToolDiffView
}

export interface ChatToolPresenter {
  call(name: string, callId: string, argumentsRaw: string): ToolCallPresentation | undefined
  result(callId: string, result: ToolResultLike): ToolResultPresentation | undefined
  argsJson(callId: string): string | undefined
}

interface CallViewLike {
  card: string
  title?: string
  rawInput?: unknown
  diffs?: readonly DiffLike[]
}

interface ResultViewLike {
  card: string
  output?: string
  exitCode?: number
  signal?: string
  content?: readonly ContentBlock[]
  diffs?: readonly DiffLike[]
  lines?: readonly ReadLineLike[]
}

interface ToolsLike {
  get?(name: string, scope?: unknown): {
    presentCall?(args: unknown): CallViewLike | undefined
    presentResult?(args: unknown, result: ToolResultLike): ResultViewLike | undefined
  } | undefined
}

export interface RegistryCommand {
  name: string
  description: string
  hint?: string
}

interface CommandsServiceLike {
  list(agent: unknown): readonly { name: string; description: string; input?: { hint: string } }[]
  execute(agent: unknown, line: string, signal: AbortSignal): Promise<unknown>
}

export interface ChatBridge {
  modelName(): string
  send(text: string): void
  interrupt(): void
  subscribe(handler: (event: SessionEvent) => void): () => void
  listSessions(): Promise<SessionSummary[]>
  openSession(id: string): Promise<void>
  newSession(): Promise<void>
  archiveSession(id: string): Promise<void>
  activeSessionId(): string
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
  listProviderDirectory(): Promise<OfficialProvider[]>
  fetchProviderModels(provider: OfficialProvider, apiKey: string): Promise<LlmDiscoveredModel[]>
  saveBuiltinProvider(provider: OfficialProvider, apiKey: string, models: LlmDiscoveredModel[]): Promise<void>
  cwd(): string
  listPresets(): Promise<PresetSummary[]>
  currentPreset(): string
  presetName(): string
  selectPreset(id: string): Promise<void>
  listEfforts(): Promise<EffortSummary[]>
  currentEffort(): string | undefined
  effortName(): string | undefined
  selectEffort(id: string): Promise<void>
  permissionMode(): string
  cyclePermission(): void
  listPermissionPresets(): Promise<string[]>
  defaultPermission(): string
  setDefaultPermission(id: string): Promise<void>
  defaultPresetId(): string
  setDefaultPreset(id: string): Promise<void>
  tokenStats(): TokenStats
  toolPresenter: ChatToolPresenter
  interactions: InteractionStore
  listRegistryCommands?(): readonly RegistryCommand[]
  onRegistryChanged?(listener: () => void): () => void
  executeCommandLine?(line: string): Promise<void>
}

let sessionCounter = 0

const SESSION_LIST_TTL_MS = 2000
const EFFORT_LIST_TTL_MS = 30000
const PRESET_LIST_TTL_MS = 2000

interface CachedList<T> {
  get(force?: boolean): Promise<T[]>
  invalidate(): void
}

function cachedList<T>(load: () => Promise<T[]>, ttlMs: number): CachedList<T> {
  let cache: T[] | undefined
  let refresh: Promise<T[]> | undefined
  let refreshedAt = 0
  return {
    get(force = false) {
      const now = Date.now()
      if (!force && cache !== undefined && refreshedAt > now - ttlMs) return Promise.resolve(cache)
      if (refresh !== undefined) return refresh
      refresh = load()
        .then(records => {
          cache = records
          refreshedAt = Date.now()
          return records
        })
        .finally(() => {
          refresh = undefined
        })
      return refresh
    },
    invalidate() {
      refreshedAt = 0
    },
  }
}

export async function createChatBridge(ctx: Context): Promise<ChatBridge> {
  const interactions = new InteractionStore()
  try {
    registerInteractionChannels(ctx as never, interactions)
  } catch {}
  const agentOptions = (): AgentOptions => {
    const selection = ctx.get('agentDefaultModel')?.currentSelection()
    if (selection === undefined) return {}
    return { provider: selection.provider, model: selection.model }
  }
  const handlers = new Set<(event: SessionEvent) => void>()
  const presets = ctx.get('agentPresets')
  const selections = new WeakMap<Agent, ModelSelectionRef>()
  const effortNames = new Map<string, string>()
  let currentCwd = process.cwd()
  void registerWorkspace(ctx, currentCwd)
  let activeHandle: AgentHandle | undefined = await createAgent(currentCwd)
  let activeAgent = activeHandle.agent
  const commandsService = ctx.get('commands') as CommandsServiceLike | undefined
  const registryListeners = new Set<() => void>()
  let registryCommands: RegistryCommand[] = []
  const syncRegistry = (): void => {
    if (commandsService === undefined) return
    try {
      registryCommands = commandsService.list(activeAgent).map(entry => ({
        name: entry.name,
        description: entry.description,
        ...(entry.input?.hint === undefined ? {} : { hint: entry.input.hint }),
      }))
    } catch {
      registryCommands = []
    }
    for (const listener of [...registryListeners]) listener()
  }
  try {
    ;(ctx as unknown as { on(name: string, listener: () => void): void }).on('commands/change', () => syncRegistry())
  } catch {}
  syncRegistry()
  const llm = ctx.llm
  const sessionList = cachedList(() => computeSessionList(ctx), SESSION_LIST_TTL_MS)
  const efforts = cachedList(() => resolveEffortSummaries(currentSelection()), EFFORT_LIST_TTL_MS)
  const presetsList = cachedList(
    async () => {
      if (presets === undefined) return []
      return (await presets.list()).map(preset => ({ id: preset.id, name: presetDisplayName(preset) }))
    },
    PRESET_LIST_TTL_MS,
  )

  function emit(event: SessionEvent): void {
    for (const handler of [...handlers]) handler(event)
  }

  ctx.on('session/event', (session, event) => {
    if (session.id !== activeAgent.id) return
    const type = (event as { type?: string }).type
    if (type === 'session/title' || type === 'turn/start') sessionList.invalidate()
    emit(event)
  })

  function installSelection(agentCtx: Context): void {
    const agent = agentCtx.agent
    if (agent === undefined) return
    selectionFor(agent)
  }

  function selectionFor(agent: Agent): ModelSelectionRef {
    const installed = selections.get(agent)
    if (installed !== undefined) return installed
    let picked: ModelSelection | undefined
    const selection: ModelSelectionRef = {
      get current(): ModelSelection {
        if (picked !== undefined) return picked
        const logged = agent.session.requestHeader()?.config
        if (logged === undefined) return ctx.agentDefaultModel.currentSelection()
        return {
          provider: logged.provider,
          model: logged.model,
          ...logged.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: logged.reasoningEffort },
        }
      },
      set current(next: ModelSelection) {
        picked = next
      },
      assembled: undefined,
    }
    installModelSelection(agent.ctx, selection)
    selections.set(agent, selection)
    return selection
  }

  function currentSelection(): ModelSelection {
    return selectionFor(activeAgent).current ?? ctx.agentDefaultModel.currentSelection()
  }

  async function resolveEffortSummaries(selection: ModelSelection): Promise<EffortSummary[]> {
    try {
      const info = await llm.resolveModelInfo(selection.provider, selection.model)
      const base = `${selection.provider}/${selection.model}`
      for (const effort of info.reasoning?.efforts ?? []) {
        effortNames.set(`${base}/${effort.id}`, effort.name)
      }
      return (info.reasoning?.efforts ?? []).map(effort => ({ id: effort.id, name: effort.name }))
    } catch {
      return []
    }
  }

  async function refreshEffortNames(): Promise<void> {
    await resolveEffortSummaries(currentSelection())
  }

  async function createAgent(cwd: string, presetId?: string): Promise<AgentHandle> {
    const resolved = presetId ?? (await presets?.resolve())?.id
    const meta = { cwd, ...(resolved === undefined ? {} : { agentPreset: resolved }) }
    const setup = async (agentCtx: Context) => {
      installSelection(agentCtx)
      await presets?.mount(agentCtx, resolved)
    }
    if (typeof ctx.agentLoop.createAgent === 'function') {
      return ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId(`tui-${Date.now()}-${++sessionCounter}`),
        meta,
        agentOptions: agentOptions(),
        setup,
      })
    }
    const agent = ctx.agentLoop.create(
      SessionId(`tui-${Date.now()}-${++sessionCounter}`),
      agentOptions(),
      { cwd },
    )
    installSelection(agent.ctx)
    await presets?.mount(agent.ctx, resolved)
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
    const setup = async (agentCtx: Context) => {
      installSelection(agentCtx)
      const session = agentCtx.agent?.session
      const resolved = session === undefined ? undefined : resolveSessionPreset(session)
      await presets?.mount(agentCtx, resolved)
    }
    if (typeof ctx.agentLoop.resume === 'function') {
      try {
        return await ctx.agentLoop.resume(ctx, { resumeSessionId: SessionId(id), agentOptions: agentOptions(), setup })
      } catch (error) {
        if (query?.readSession === undefined) throw error
        const snapshot = await query.readSession(String(id))
        return ctx.agentLoop.createAgent(ctx, {
          sessionId: SessionId(id),
          seed: snapshot.events,
          meta: { cwd: snapshot.session.cwd },
          agentOptions: agentOptions(),
          setup,
        })
      }
    }
    if (query?.readSession !== undefined) {
      const snapshot = await query.readSession(String(id))
      return ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId(id),
        seed: snapshot.events,
        meta: { cwd: snapshot.session.cwd },
        agentOptions: agentOptions(),
        setup,
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
      syncRegistry()
      if (previous !== undefined) await previous.dispose()
      syncCwd()
      for (const event of activeAgent.session.events) emit(event)
      void repairEffortSelection()
      sessionList.invalidate()
      efforts.invalidate()
      return
    }
    const handle = await resumeAgent(sessionId)
    const previous = activeHandle
    activeHandle = handle
    activeAgent = handle.agent
    syncRegistry()
    if (previous !== undefined) await previous.dispose()
    syncCwd()
    for (const event of activeAgent.session.events) emit(event)
    void repairEffortSelection()
    sessionList.invalidate()
    efforts.invalidate()
  }

  function syncCwd(): void {
    const cwd = activeAgent.session.header.cwd
    if (cwd !== undefined) currentCwd = cwd
    void registerWorkspace(ctx, currentCwd)
  }

  async function newSession(): Promise<void> {
    const handle = await createAgent(currentCwd)
    const previous = activeHandle
    activeHandle = handle
    activeAgent = handle.agent
    syncRegistry()
    if (previous !== undefined) await previous.dispose()
    void repairEffortSelection()
    sessionList.invalidate()
    efforts.invalidate()
  }

  async function archiveSession(id: string): Promise<void> {
    const workspace = ctx.get('workspaceRegistry') as { archiveSession?(sessionId: SessionId): Promise<void> } | undefined
    if (workspace?.archiveSession === undefined) throw new Error('workspace registry is not configured')
    await workspace.archiveSession(SessionId(id))
    sessionList.invalidate()
  }

  async function repairEffortSelection(): Promise<void> {
    const selection = currentSelection()
    if (selection === undefined || selection.reasoningEffort === undefined) return
    try {
      await llm.resolveCallConfig({
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
      })
      efforts.invalidate()
      return
    } catch {
    }
    try {
      const resolved = await llm.resolveCallConfig({ provider: selection.provider, model: selection.model })
      selectionFor(activeAgent).current = resolved
      efforts.invalidate()
      return
    } catch {
    }
    const fallback = ctx.get('agentDefaultModel')?.currentSelection()
    if (fallback !== undefined) selectionFor(activeAgent).current = fallback
    efforts.invalidate()
  }

  function currentPreset(): string {
    const resolved = resolveSessionPreset(activeAgent.session)
    return resolved ?? presets?.defaultId ?? 'standard'
  }

  async function selectPreset(id: string): Promise<void> {
    if (presets === undefined) throw new Error('agent presets are not configured')
    if (currentPreset() === id) return
    const session = activeAgent.session
    if (!isBlankSession(session.events)) {
      throw new Error('the preset is fixed once the session has started; use /new to start a new session')
    }
    const preset = await presets.recompose(activeAgent.ctx, id)
    session.append('agent-preset/selected', { agentPreset: preset.id })
  }

  function permission(): PermissionPresetsLike | undefined {
    return ctx.get('permissionPresets') as PermissionPresetsLike | undefined
  }

  function settingsService(): { update(ns: string, patch: object): Promise<void> } {
    const service = ctx.get('settings') as { update(ns: string, patch: object): Promise<void> } | undefined
    if (service === undefined) throw new Error('settings service is not available')
    return service
  }

  const tools = ctx.get('tools') as ToolsLike | undefined
  const toolCalls = new Map<string, { name: string; args: unknown }>()
  const MAX_TOOL_CALLS = 1000
  const rememberToolCall = (callId: string, name: string, args: unknown): void => {
    if (!toolCalls.has(callId) && toolCalls.size >= MAX_TOOL_CALLS) {
      const oldest = toolCalls.keys().next()
      if (!oldest.done) toolCalls.delete(oldest.value)
    }
    toolCalls.set(callId, { name, args })
  }
  const argsJson = (callId: string): string | undefined => {
    const call = toolCalls.get(callId)
    if (call === undefined) return undefined
    try {
      return JSON.stringify(call.args, null, 2)
    } catch {
      return undefined
    }
  }
  const toolPresenter: ChatToolPresenter = {
    call(name, callId, argumentsRaw) {
      let args: unknown
      try {
        args = JSON.parse(argumentsRaw)
      } catch {
        return undefined
      }
      rememberToolCall(callId, name, args)
      const view = tools?.get?.(name, activeAgent)?.presentCall?.(args)
      const cwd = currentCwd
      if (view !== undefined && view.card === 'diff' && view.diffs !== undefined && view.diffs.length > 0) {
        const rawPath = view.diffs[0]!.path
        const path = typeof rawPath === 'string' && rawPath !== '' ? rawPath
          : String((args as { file_path?: unknown }).file_path ?? (args as { path?: unknown }).path ?? '')
        const display = truncateSummary(relativize(path, cwd))
        if (DIFF_TOOL_NAMES.has(name)) {
          return {
            label: `${name}[${display}]`,
            body: '',
            diff: { path: relativize(path, cwd), hunks: diffLineGroups(view.diffs) },
          }
        }
        return {
          label: `${name}[${display}]`,
          body: formatDiffDiffs(view.diffs),
          bodyCol: 2,
        }
      }
      if (name === 'read') {
        const rawPath = String((args as { file_path?: unknown }).file_path ?? '')
        return {
          label: `read[${truncateSummary(relativize(rawPath, cwd) + summarizeOthers(args, ['file_path'], cwd))}]`,
          body: argsJson(callId) ?? '',
        }
      }
      return {
        label: `${name}[${summarizeParams(args, cwd)}]`,
        body: argsJson(callId) ?? '',
      }
    },
    result(callId, result) {
      const call = toolCalls.get(callId)
      if (call === undefined) return undefined
      const view = tools?.get?.(call.name, activeAgent)?.presentResult?.(call.args, result)
      if (view === undefined) return undefined
      if (view.card === 'terminal') {
        return {
          kind: 'append',
          text: view.output ?? '',
          ...view.exitCode === undefined ? {} : { exitCode: view.exitCode },
          ...view.signal === undefined ? {} : { signal: view.signal },
        }
      }
      if (view.card === 'read' && view.lines !== undefined) {
        return { kind: 'replace', text: formatReadLines(view.lines), bodyCol: readBodyCol(view.lines) }
      }
      if (view.card === 'diff' && view.diffs !== undefined) {
        const base = { kind: 'replace' as const, text: formatDiffDiffs(view.diffs), bodyCol: 2 }
        if (!DIFF_TOOL_NAMES.has(call.name)) return base
        const rawPath = view.diffs[0]!.path
        const path = typeof rawPath === 'string' && rawPath !== '' ? rawPath : ''
        return { ...base, diff: { path: relativize(path, currentCwd), hunks: diffLineGroups(view.diffs) } }
      }
      if (view.card === 'generic' && view.content !== undefined) {
        return { kind: 'append', text: textFromBlocks(view.content) }
      }
      return undefined
    },
    argsJson,
  }

  async function selectModel(provider: string, name: string): Promise<void> {
    const resolved = await llm.resolveCallConfig({ provider, model: name })
    selectionFor(activeAgent).current = {
      provider: resolved.provider,
      model: resolved.model,
      ...resolved.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: resolved.reasoningEffort },
    }
    try {
      await ctx.agentDefaultModel.saveSelection(resolved)
    } catch {}
    efforts.invalidate()
    void refreshEffortNames()
  }

  async function listEfforts(): Promise<EffortSummary[]> {
    return efforts.get()
  }

  function currentEffort(): string | undefined {
    return currentSelection().reasoningEffort
  }

  function effortName(): string | undefined {
    const selection = currentSelection()
    if (selection.reasoningEffort === undefined) return undefined
    return effortNames.get(`${selection.provider}/${selection.model}/${selection.reasoningEffort}`)
      ?? String(selection.reasoningEffort)
  }

  async function selectEffort(id: string): Promise<void> {
    const current = currentSelection()
    if (current.reasoningEffort === id) return
    const resolved = await llm.resolveCallConfig({
      provider: current.provider,
      model: current.model,
      reasoningEffort: ReasoningEffortId(id),
    })
    selectionFor(activeAgent).current = {
      provider: resolved.provider,
      model: resolved.model,
      ...resolved.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: resolved.reasoningEffort },
    }
    try {
      await ctx.agentDefaultModel.saveSelection(resolved)
    } catch {}
    efforts.invalidate()
    void refreshEffortNames()
  }

  function tokenStats(): TokenStats {
    const projections = ctx.get('sessionProjections') as {
      snapshot?(session: Session): { values: Record<string, unknown> }
    } | undefined
    let usage: { uncachedInputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number } | undefined
    let pressure: { projectedTokens?: number; contextWindow?: number } | undefined
    if (projections !== undefined) {
      try {
        const values = projections.snapshot?.(activeAgent.session)?.values
        usage = values?.tokenUsage as typeof usage
        pressure = values?.contextPressure as typeof pressure
      } catch {}
    }
    const input = (usage?.uncachedInputTokens ?? 0) + (usage?.cacheReadTokens ?? 0) + (usage?.cacheWriteTokens ?? 0)
    const output = usage?.outputTokens ?? 0
    const contextPercent = pressure?.projectedTokens !== undefined && pressure?.contextWindow !== undefined
      ? Math.min(100, Math.round(pressure.projectedTokens / pressure.contextWindow * 100))
      : 0
    return {
      input,
      output,
      hitPercent: input === 0 ? 0 : Math.round((usage?.cacheReadTokens ?? 0) / input * 100),
      contextPercent,
      ...pressure?.projectedTokens === undefined ? {} : { projectedTokens: pressure.projectedTokens },
      ...pressure?.contextWindow === undefined ? {} : { contextWindow: pressure.contextWindow },
    }
  }

  async function listSessions(): Promise<SessionSummary[]> {
    return sessionList.get()
  }

  void sessionList.get()
  void refreshEffortNames()

  return {
    modelName: () => currentSelection()?.model ?? 'deepseek-v4-flash',
    send(text: string) {
      activeAgent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    interrupt() {
      activeAgent.cancel({ kind: 'user' })
    },
    subscribe(handler: (event: SessionEvent) => void) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    listRegistryCommands: () => registryCommands,
    onRegistryChanged(listener: () => void) {
      registryListeners.add(listener)
      return () => {
        registryListeners.delete(listener)
      }
    },
    async executeCommandLine(line: string) {
      if (commandsService === undefined) return
      try {
        await commandsService.execute(activeAgent, line, new AbortController().signal)
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        emit({ type: 'command/done', data: { commandId: '', kind: 'error', text } } as unknown as SessionEvent)
      }
    },
    listSessions,
    openSession,
    newSession,
    archiveSession,
    activeSessionId: () => String(activeAgent.id),
    listModels: () => listConfiguredModels(llm),
    selectModel,
    addDeepSeekKey: key => addDeepSeekKey(ctx.credentials, key),
    fetchCustomModels: form => fetchCustomModels(llm, form),
    saveCustomProvider: (form, models) => saveCustomProvider(ctx.settings, ctx.credentials, form, models),
    listProviderDirectory: async () => listProviderDirectory(llm),
    fetchProviderModels: (provider, apiKey) => fetchProviderModels(llm, provider.settingsNs, provider.provider, apiKey),
    saveBuiltinProvider: (provider, apiKey, models) => saveBuiltinProvider(ctx.settings, ctx.credentials, provider, apiKey, models),
    cwd: () => currentCwd,
    listPresets: () => presetsList.get(),
    currentPreset,
    presetName: () => builtInPresetName(currentPreset()) ?? currentPreset(),
    selectPreset,
    listEfforts,
    currentEffort,
    effortName,
    selectEffort,
    permissionMode: () => permission()?.current(activeAgent.session.events) ?? PERMISSION_PRESETS[0],
    cyclePermission: () => {
      const service = permission()
      if (service === undefined) return
      const current = service.current(activeAgent.session.events)
      const index = (PERMISSION_PRESETS as readonly string[]).indexOf(current)
      const next = PERMISSION_PRESETS[(index + 1) % PERMISSION_PRESETS.length]
      service.set(activeAgent.session, next)
    },
    listPermissionPresets: async () => {
      const service = permission()
      return service === undefined ? [...PERMISSION_PRESETS] : [...service.names]
    },
    defaultPermission: () => permission()?.defaultPreset ?? PERMISSION_PRESETS[0],
    setDefaultPermission: async id => {
      await settingsService().update('permission', { defaultPreset: id })
    },
    defaultPresetId: () => presets?.defaultId ?? 'standard',
    setDefaultPreset: async id => {
      await settingsService().update('agent-presets', { default: id })
    },
    tokenStats,
    toolPresenter,
    interactions,
  }
}

async function registerWorkspace(ctx: Context, path: string): Promise<void> {
  const workspace = ctx.get('workspaceRegistry') as { create?(path: string): Promise<unknown> } | undefined
  try {
    await workspace?.create?.(path)
  } catch {}
}