import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, AgentOptions, ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { textFromBlocks } from './blocks.ts'
import { imageMediaTypeOf } from '../core/paste.ts'
import type { PendingImage } from '../core/paste.ts'
import {
  deleteProviderProfile,
  fetchCustomModels,
  fetchProviderModels,
  deleteModelEntry,
  listConfiguredModels,
  listProviderDirectory,
  readModelEntries,
  resolveModelEntryEfforts,
  saveCustomProvider,
  saveModelEntry,
  saveProviderKey,
  saveProviderModels,
} from './models.ts'
import type { ConfiguredModel, CustomProviderForm, DescribedModel, ModelEntryConfig, OfficialProvider, SettingsPathOp } from './models.ts'
import { formatDiffDiffs, dedupeTitle, diffLineGroups, pathFromTitle, pickPrimaryParam, relativize, remainingArgsJson, truncateSummary, terminalCallBody, genericCallBody, genericCallHeader, recoveryLines, formatSearchView } from './tool-view.ts'
import { TODO_TOOL_NAME } from './todo-view.ts'
import { ASK_USER_TOOL_NAME } from './question-view.ts'
import type { DiffLike, ReadLineLike, ToolDiffView } from './tool-view.ts'
import type { ToolResultPresentation, ToolReadView } from '../contract/index.ts'
import { ToolCallLedger, createToolViewPresenter, toolViewOf } from './tool-views.ts'
import { computeSessionList } from './session-list.ts'
import type { SessionSummary } from './session-list.ts'
import { builtInPresetName, isBlankSession, presetDisplayName } from './presets.ts'
import type { PresetSummary } from './presets.ts'
import type { EffortSummary } from './efforts.ts'
import { InteractionStore, registerInteractionChannels } from './interactions.ts'
import { applyTheme } from '../apply-theme.ts'
import { THEME_SETTINGS_NAMESPACE } from '../theme-settings.ts'
import { themeMode } from '../theme.ts'
import type { ThemeMode } from '../theme.ts'
import { error as logError, warn } from '../log.ts'

interface AttachmentsServiceLike {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<ImageAttachmentRef>
}

function attachmentsService(ctx: Context): AttachmentsServiceLike | undefined {
  return ctx.get('attachments') as AttachmentsServiceLike | undefined
}

export async function resolvePendingImages(images: readonly PendingImage[]): Promise<{ ok: ImageAttachmentInput[]; failed: string[] }> {
  const ok: ImageAttachmentInput[] = []
  const failed: string[] = []
  for (const image of images) {
    if (image.kind === 'data') {
      ok.push({ name: image.name ?? 'clipboard', mediaType: image.mediaType, data: image.data })
      continue
    }
    const mediaType = imageMediaTypeOf(image.path)
    if (mediaType === undefined) {
      failed.push(image.path)
      continue
    }
    try {
      const { readFile } = await import('node:fs/promises')
      ok.push({ name: image.path, mediaType, data: new Uint8Array(await readFile(image.path)) })
    } catch {
      failed.push(image.path)
    }
  }
  return { ok, failed }
}

export interface ImageAttachmentInput {
  name: string
  mediaType: string
  data: Uint8Array
}
interface AgentLike {
  followup(message: unknown): void
}

const EMPTY_TEXT = { type: 'text' as const, text: '' }

async function sendContent(
  agent: AgentLike,
  text: string,
  hasText: boolean,
  groups: ReadonlyArray<readonly PendingImage[]>,
  ctx: Context,
): Promise<void> {
  if (groups.length === 0) {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    return
  }
  const attachments = attachmentsService(ctx)
  if (attachments === undefined) {
    const note = 'image attachments require the attachment service, which is not mounted'
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: hasText ? `${text}\n\n${note}` : note }],
      source: { kind: 'user' },
    }))
    return
  }
  const content: ContentBlock[] = hasText ? [{ type: 'text', text }] : []
  for (const group of groups) {
    const { ok, failed } = await resolvePendingImages(group)
    if (failed.length > 0) {
      content.push({ type: 'text', text: `[image failed: ${failed.join(', ')}]` })
    }
    for (const image of ok) {
      try {
        const ref = await attachments.saveImage({ data: image.data, mediaType: image.mediaType, name: image.name })
        content.push({ type: 'image', attachment: ref })
      } catch {
        content.push({ type: 'text', text: `[image failed: ${image.name}]` })
      }
    }
    content.push({ ...EMPTY_TEXT })
  }
  const hasImage = content.some(block => block.type === 'image')
  if (!hasImage) {
    const joined = content.map(block => block.type === 'text' ? block.text : '').join('').trim()
    agent.followup(createUserMessage({ content: [{ type: 'text', text: joined }], source: { kind: 'user' } }))
    return
  }
  agent.followup(createUserMessage({ content, source: { kind: 'user' } }))
}

interface PresetSessionLike {
  snapshotEvents(): ReadonlyArray<{ type?: string; data?: unknown }>
  header?: { agentPreset?: string }
}

export const PERMISSION_PRESETS = ['workspace-write', 'danger-full-access', 'read-only'] as const

interface PermissionPresetsLike {
  current(session: Session): string
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

export interface CallViewLike {
  card: string
  title?: string
  kind?: string
  rawInput?: unknown
  description?: string
  cwd?: string
  content?: readonly ContentBlock[]
  diffs?: readonly DiffLike[]
}

export interface ResultViewLike {
  card: string
  output?: string
  exitCode?: number
  signal?: string
  content?: readonly ContentBlock[]
  diffs?: readonly DiffLike[]
  lines?: readonly ReadLineLike[]
  shape?: 'paths' | 'matches'
  paths?: readonly string[]
  files?: readonly { path: string; matches: readonly { lineNumber: number; line: string }[] }[]
  truncated?: boolean
  total?: number
  kind?: string
  url?: string
  statusCode?: number
  sources?: readonly { url: string; title?: string; snippet?: string; publishedAt?: string }[]
  answer?: string
  title?: string
  path?: string
  offset?: number
  totalLines?: number
  lang?: string
}

interface ToolsLike {
  get?(name: string, scope?: unknown): {
    presentCall?(args: unknown): CallViewLike | undefined
    presentResult?(args: unknown, result: ToolResultLike): ResultViewLike | undefined
  } | undefined
}

export interface BuiltinToolPresenterDeps {
  /** The shared call ledger; a call a contribution took over still resolves here. */
  ledger: ToolCallLedger
  presentCall(tool: string, args: unknown): CallViewLike | undefined
  presentResult(tool: string, args: unknown, result: ToolResultLike): ResultViewLike | undefined
  cwd(): string
}

function parseArgumentsRaw(argumentsRaw: string): unknown {
  try {
    return JSON.parse(argumentsRaw) as unknown
  } catch {
    return argumentsRaw
  }
}

function resultTitleLabel(name: string, title: string | undefined): string | undefined {
  if (title === undefined || title === '') return undefined
  const suffix = dedupeTitle(name, title)
  return suffix === '' ? name : `${name} ${suffix}`
}

/**
 * The builtin presenter: maps the harness render-intent protocol
 * (`presentCall`/`presentResult` views) onto the universal tool bubble with
 * no per-tool branching. Tools the protocol does not describe fall through to
 * the generic summary (priority-key primary param + args JSON body).
 */
export function createBuiltinToolPresenter(deps: BuiltinToolPresenterDeps): ChatToolPresenter {
  const cwd = (): string => deps.cwd()
  return {
    call(name, callId, argumentsRaw) {
      const remembered = deps.ledger.get(callId)
      const args = remembered !== undefined ? remembered.args : parseArgumentsRaw(argumentsRaw)
      const view = deps.presentCall(name, args)
      if (view !== undefined && view.card === 'diff' && view.diffs !== undefined && view.diffs.length > 0) {
        const rawPath = view.diffs[0]!.path
        const path = pathFromTitle(view.title, typeof rawPath === 'string' && rawPath !== '' ? rawPath
          : String((args as { file_path?: unknown }).file_path ?? (args as { path?: unknown }).path ?? ''))
        const extra = view.diffs.length > 1 ? ` (+${view.diffs.length - 1})` : ''
        return {
          label: `${name} ${truncateSummary(relativize(path, cwd()))}${extra}`,
          body: '',
          diff: { path: relativize(path, cwd()), hunks: diffLineGroups(view.diffs) },
        }
      }
      if (view !== undefined && view.card === 'terminal') {
        return {
          label: view.description === undefined || view.description === '' ? name : `${name} ${view.description}`,
          body: terminalCallBody(view.title, view.cwd, cwd()),
        }
      }
      if (view !== undefined && view.kind === 'read') {
        const rawPath = String((args as { file_path?: unknown }).file_path ?? (args as { path?: unknown }).path ?? '')
        if (rawPath !== '') {
          const offset = (args as { offset?: unknown }).offset
          const limit = (args as { limit?: unknown }).limit
          const window = [
            ...(typeof offset === 'number' && offset > 0 ? [`offset=${offset}`] : []),
            ...(typeof limit === 'number' && limit > 0 ? [`lines=${limit}`] : []),
          ]
          const label = `${name} ${truncateSummary(relativize(rawPath, cwd()))}${window.length === 0 ? '' : `[${window.join(',')}]`}`
          return { label, body: '' }
        }
      }
      if (view !== undefined && (view.kind === 'search' || view.kind === 'fetch')) {
        const primary = dedupeTitle(name, view.title ?? '')
        return { label: primary === '' ? name : `${name} ${primary}`, body: '' }
      }
      if (view !== undefined) {
        const contentText = view.content !== undefined ? textFromBlocks(view.content) : ''
        const suffix = genericCallHeader(name, view, contentText)
        const label = suffix === '' ? name : `${name} ${suffix}`
        return { label, body: genericCallBody(view.rawInput, contentText, suffix) }
      }
      const primary = pickPrimaryParam(args)
      return {
        label: primary === undefined ? name : `${name} ${primary.key}=${primary.value}`,
        body: remainingArgsJson(args, primary?.key),
      }
    },
    result(callId, result) {
      const call = deps.ledger.get(callId)
      if (call === undefined) return undefined
      const name = call.name
      const view = deps.presentResult(name, call.args, result)
      if (view === undefined) return undefined
      const label = resultTitleLabel(name, view.title)
      const labelPatch = label === undefined ? {} : { label }
      if (view.card === 'terminal') {
        return {
          kind: 'append',
          text: view.output ?? '',
          ...view.exitCode === undefined ? {} : { exitCode: view.exitCode },
          ...view.signal === undefined ? {} : { signal: view.signal },
        }
      }
      if (view.card === 'read' && view.lines !== undefined) {
        if (view.lines.length === 0 && view.totalLines === undefined) return undefined
        const read: ToolReadView = {
          ...(view.path === undefined || view.path === '' ? {} : { path: relativize(view.path, cwd()) }),
          lines: view.lines,
          ...(view.offset === undefined || view.offset <= 0 ? {} : { offset: view.offset }),
          ...(view.totalLines === undefined ? {} : { totalLines: view.totalLines }),
          ...(view.lang === undefined || view.lang === '' ? {} : { lang: view.lang }),
        }
        return { kind: 'replace', text: '', ...labelPatch, read }
      }
      if (view.card === 'diff' && view.diffs !== undefined) {
        const rawPath = view.diffs[0]!.path
        const path = typeof rawPath === 'string' && rawPath !== '' ? rawPath : ''
        return {
          kind: 'replace',
          text: formatDiffDiffs(view.diffs),
          bodyCol: 2,
          ...labelPatch,
          diff: { path: relativize(path, cwd()), hunks: diffLineGroups(view.diffs) },
        }
      }
      if (view.card === 'generic' && (view.content !== undefined || label !== undefined)) {
        return { kind: 'append', text: view.content === undefined ? '' : textFromBlocks(view.content), ...labelPatch }
      }
      if (view.card === 'search') {
        const grouped = formatSearchView(view)
        // An empty structured result (no paths, no matches) still has a raw
        // text — "No matches found" — that the card must not blank out.
        if (grouped === '' && view.truncated !== true) {
          const raw = textFromBlocks(result.content)
          if (raw.trim() !== '') return { kind: 'replace', text: raw, ...labelPatch }
        }
        const lines: string[] = []
        if (grouped !== '') lines.push(grouped)
        if (view.truncated === true) {
          lines.push(`... ${view.total} total`)
          lines.push(...recoveryLines(textFromBlocks(result.content)))
        }
        return { kind: 'replace', text: lines.length === 0 ? '' : lines.join('\n'), ...labelPatch }
      }
      if (view.card === 'web' && view.kind === 'search') {
        const lines: string[] = []
        if (view.answer !== undefined && view.answer !== '') lines.push(view.answer)
        for (const source of view.sources ?? []) {
          const date = source.publishedAt === undefined || source.publishedAt === ''
            ? ''
            : ` (${source.publishedAt.slice(0, 10)})`
          lines.push(`- ${source.title === undefined ? source.url : `${source.title} · ${source.url}`}${date}`)
          if (source.snippet !== undefined && source.snippet !== '') {
            lines.push(`  ${truncateSummary(source.snippet, 160)}`)
          }
        }
        if (view.truncated === true) lines.push('... results truncated')
        return { kind: 'replace', text: lines.join('\n') }
      }
      if (view.card === 'web' && view.kind === 'fetch') {
        const header = `HTTP ${view.statusCode} ${view.url}`
        const body = textFromBlocks(result.content)
        return { kind: 'replace', text: `${header}${view.truncated === true ? ' · ... content truncated' : ''}${body === '' ? '' : `\n\n${body}`}` }
      }
      return undefined
    },
    argsJson: callId => deps.ledger.argsJson(callId),
  }
}

export interface RegistryCommand {
  name: string
  description: string
  hint?: string
}

interface CommandsServiceLike {
  list(agent: unknown): readonly { name: string; description: string; input?: { hint: string } }[]
  execute(agent: unknown, line: string, images: readonly unknown[], signal: AbortSignal): Promise<unknown>
}

export interface ChatBridge {
  modelName(): string
  send(text: string, images?: ReadonlyArray<readonly PendingImage[]>): void
  interrupt(): void
  subscribe(handler: (event: SessionEvent) => void): () => void
  listSessions(): Promise<SessionSummary[]>
  onSessionListChanged(listener: () => void): () => void
  openSession(id: string): Promise<void>
  newSession(): Promise<void>
  archiveSession(id: string): Promise<void>
  activeSessionId(): string
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  fetchCustomModels(form: CustomProviderForm): Promise<LlmDiscoveredModel[]>
  saveCustomProvider(form: CustomProviderForm, models: LlmDiscoveredModel[]): Promise<void>
  listProviderDirectory(): Promise<OfficialProvider[]>
  fetchProviderModels(provider: OfficialProvider, apiKey: string): Promise<LlmDiscoveredModel[] | undefined>
  saveProviderKey(provider: OfficialProvider, apiKey: string): Promise<void>
  saveProviderModels(provider: OfficialProvider, models: LlmDiscoveredModel[]): Promise<void>
  deleteProvider(provider: OfficialProvider): Promise<void>
  readModelEntries(ns: string, provider: string): ModelEntryConfig[]
  saveModelEntry(ns: string, provider: string, entry: ModelEntryConfig): Promise<void>
  deleteModelEntry(ns: string, provider: string, modelId: string): Promise<void>
  describeModel(provider: string, model: string): Promise<DescribedModel>
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
  themePreference(): ThemeMode
  setThemePreference(mode: ThemeMode): Promise<void>
  tokenStats(): TokenStats
  toolPresenter: ChatToolPresenter
  interactions: InteractionStore
  listRegistryCommands(): readonly RegistryCommand[]
  onRegistryChanged(listener: () => void): () => void
  executeCommandLine(line: string): Promise<void>
  dispose(): void
}

let sessionCounter = 0

const SESSION_LIST_TTL_MS = 2000
const EFFORT_LIST_TTL_MS = 30000
const PRESET_LIST_TTL_MS = 2000
const MODEL_LIST_TTL_MS = 30000

interface CachedList<T> {
  get(force?: boolean): Promise<T[]>
  invalidate(): void
  clear(): void
  onRefresh(listener: () => void): () => void
}

const INVALIDATE_REFRESH_DELAY_MS = 100

function cachedList<T>(
  load: () => Promise<T[]>,
  ttlMs: number,
  options: { staleWhileRevalidate?: boolean; refreshOnInvalidate?: boolean } = {},
): CachedList<T> {
  let cache: T[] | undefined
  let refresh: Promise<T[]> | undefined
  let refreshedAt = 0
  let invalidations = 0
  let invalidateTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const startRefresh = (): Promise<T[]> => {
    if (refresh !== undefined) return refresh
    const epoch = invalidations
    refresh = load()
      .then(records => {
        cache = records
        if (epoch === invalidations) refreshedAt = Date.now()
        for (const listener of [...listeners]) listener()
        return records
      })
      .finally(() => {
        refresh = undefined
      })
    return refresh
  }
  const scheduleRefresh = (): void => {
    if (invalidateTimer !== undefined) return
    invalidateTimer = setTimeout(() => {
      invalidateTimer = undefined
      void startRefresh().catch(() => {})
    }, INVALIDATE_REFRESH_DELAY_MS)
  }
  return {
    get(force = false) {
      const now = Date.now()
      if (!force && cache !== undefined && refreshedAt > now - ttlMs) return Promise.resolve(cache)
      if (!force && options.staleWhileRevalidate === true && cache !== undefined) {
        void startRefresh().catch(() => {})
        return Promise.resolve(cache)
      }
      return startRefresh()
    },
    invalidate() {
      refreshedAt = 0
      invalidations += 1
      if (options.refreshOnInvalidate === true) scheduleRefresh()
    },
    clear() {
      cache = undefined
      refreshedAt = 0
    },
    onRefresh(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export async function createChatBridge(ctx: Context): Promise<ChatBridge> {
  const interactions = new InteractionStore()
  let interactionChannels: (() => void) | undefined
  try {
    interactionChannels = registerInteractionChannels(ctx as never, interactions)
  } catch (cause) {
    // Without the interaction channels, approvals and questions stay unanswered.
    warn('bridge', 'interaction channels are unavailable', {
      message: cause instanceof Error ? cause.message : String(cause),
    })
  }
  const agentOptions = (): AgentOptions => {
    const selection = ctx.get('agentDefaultModel')?.currentSelection()
    if (selection === undefined) return {}
    return { provider: selection.provider, model: selection.model }
  }
  const handlers = new Set<(event: SessionEvent) => void>()
  const presets = ctx.get('agentPresets')
  const selections = new WeakMap<Agent, ModelSelectionRef>()
  const effortNames = new Map<string, string>()
  const defaultCwd = process.cwd()
  let currentCwd = defaultCwd
  const sessionList = cachedList(
    () => computeSessionList(ctx),
    SESSION_LIST_TTL_MS,
    { staleWhileRevalidate: true, refreshOnInvalidate: true },
  )
  void sessionList.get().catch(() => {})
  void registerWorkspace(ctx, defaultCwd).then(() => sessionList.invalidate()).catch(() => {})
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
  } catch (cause) {
    // The commands service does not emit change events on this host; the sync stays one-shot.
    warn('bridge', 'commands/change subscription failed', {
      message: cause instanceof Error ? cause.message : String(cause),
    })
  }
  syncRegistry()
  const llm = ctx.llm
  const efforts = cachedList(() => resolveEffortSummaries(currentSelection()), EFFORT_LIST_TTL_MS)
  const presetsList = cachedList(
    async () => {
      if (presets === undefined) return []
      return (await presets.list()).map(preset => ({ id: preset.id, name: presetDisplayName(preset) }))
    },
    PRESET_LIST_TTL_MS,
  )
  const modelsList = cachedList(() => listConfiguredModels(llm), MODEL_LIST_TTL_MS, { staleWhileRevalidate: true })

  function emit(event: SessionEvent): void {
    for (const handler of [...handlers]) handler(event)
  }

  const offSessionEvents = ctx.on('session/event', (session, event) => {
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

  function selectionWithEffort(resolved: ModelSelection): ModelSelection {
    return {
      provider: resolved.provider,
      model: resolved.model,
      ...resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort },
    }
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
        return selectionWithEffort({ provider: logged.provider, model: logged.model, reasoningEffort: logged.reasoningEffort })
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

  function currentSelection(): ModelSelection | undefined {
    return selectionFor(activeAgent).current ?? ctx.agentDefaultModel.currentSelection()
  }

  async function resolveEffortSummaries(selection: ModelSelection | undefined): Promise<EffortSummary[]> {
    if (selection === undefined) return []
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

  async function describeModel(provider: string, model: string): Promise<DescribedModel> {
    const info = await llm.resolveModelInfo(provider, model)
    return {
      name: info.name,
      ...(info.context === undefined ? {} : { contextWindow: info.context.contextWindow }),
      image: info.inputModalities?.includes('image') ?? false,
    }
  }

  // The 0.1.2 presets package dropped its resolveSessionPreset helper, so the
  // session log is read directly: the newest selection event wins over the
  // creation-time header value, matching the upstream semantics on every
  // host version the peer range admits.
  function resolveSessionPreset(session: PresetSessionLike): string | undefined {
    const events = session.snapshotEvents()
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type === 'agent-preset/selected') {
        const data = event.data as { agentPreset?: string } | undefined
        if (data?.agentPreset !== undefined) return data.agentPreset
      }
    }
    return session.header?.agentPreset
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
      try {
        await presets?.mount(agentCtx, resolved)
      } catch (cause) {
        // A stored preset row that no longer mounts must not lock the user
        // out of their own history; the session opens without it instead.
        warn('bridge', 'stored agent preset failed to mount; continuing without it', {
          preset: resolved ?? '(session default)',
          message: cause instanceof Error ? cause.message : String(cause),
        })
      }
    }
    const spawnResumedAgent = async (snapshot: { session: { cwd?: string }; events: SessionEvent[] }): Promise<AgentHandle> => {
      return ctx.agentLoop.createAgent(ctx, {
        sessionId: SessionId(id),
        seed: snapshot.events,
        meta: { cwd: snapshot.session.cwd },
        agentOptions: agentOptions(),
        setup,
      })
    }
    if (typeof ctx.agentLoop.resume === 'function') {
      try {
        return await ctx.agentLoop.resume(ctx, { resumeSessionId: SessionId(id), agentOptions: agentOptions(), setup })
      } catch (error) {
        if (query?.readSession === undefined) throw error
        return spawnResumedAgent(await query.readSession(String(id)))
      }
    }
    if (query?.readSession !== undefined) return spawnResumedAgent(await query.readSession(String(id)))
    throw new Error('cannot resume session: session persistence is not configured')
  }

  async function activateAgent(handle: AgentHandle | undefined, agent: Agent): Promise<void> {
    const previous = activeHandle
    activeHandle = handle
    activeAgent = agent
    syncRegistry()
    if (previous !== undefined) await previous.dispose()
  }

  function refreshAgentState(): void {
    void repairEffortSelection()
    sessionList.invalidate()
    efforts.invalidate()
  }

  async function openSession(id: string): Promise<void> {
    const sessionId = SessionId(id)
    if (activeAgent.id === sessionId) {
      for (const event of activeAgent.session.snapshotEvents()) emit(event)
      return
    }
    const existing = ctx.agents.get(sessionId)
    if (existing !== undefined) {
      await activateAgent(undefined, existing)
      syncCwd()
      for (const event of activeAgent.session.snapshotEvents()) emit(event)
      refreshAgentState()
      return
    }
    const handle = await resumeAgent(sessionId)
    await activateAgent(handle, handle.agent)
    syncCwd()
    for (const event of activeAgent.session.snapshotEvents()) emit(event)
    refreshAgentState()
  }

  function syncCwd(): void {
    const cwd = activeAgent.session.header.cwd
    if (cwd !== undefined) currentCwd = cwd
    void registerWorkspace(ctx, currentCwd)
  }

  async function newSession(): Promise<void> {
    currentCwd = defaultCwd
    void registerWorkspace(ctx, currentCwd)
    const handle = await createAgent(currentCwd)
    await activateAgent(handle, handle.agent)
    refreshAgentState()
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
      // The configured effort is unsupported; fall through to the plain call config below.
    }
    try {
      const resolved = await llm.resolveCallConfig({ provider: selection.provider, model: selection.model })
      selectionFor(activeAgent).current = resolved
      efforts.invalidate()
      return
    } catch {
      // Even the plain config is unreachable; fall back to the default model selection.
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
    if (!isBlankSession(session.snapshotEvents())) {
      throw new Error('the preset is fixed once the session has started; use /new to start a new session')
    }
    const preset = await presets.recompose(activeAgent.ctx, id)
    session.append('agent-preset/selected', { agentPreset: preset.id })
  }

  function permission(): PermissionPresetsLike | undefined {
    return ctx.get('permissionPresets') as PermissionPresetsLike | undefined
  }

  function settingsService(): { update(ns: string, patch: object): Promise<void>; get(ns: string): unknown; mutate(ns: string, ops: readonly SettingsPathOp[]): Promise<void> } {
    const service = ctx.get('settings') as { update(ns: string, patch: object): Promise<void>; get(ns: string): unknown; mutate(ns: string, ops: readonly SettingsPathOp[]): Promise<void> } | undefined
    if (service === undefined) throw new Error('settings service is not available')
    return service
  }

  const tools = ctx.get('tools') as ToolsLike | undefined
  const ledger = new ToolCallLedger()
  const toolPresenter = createToolViewPresenter(
    createBuiltinToolPresenter({
      ledger,
      presentCall: (tool: string, args: unknown) => tools?.get?.(tool, activeAgent)?.presentCall?.(args),
      presentResult: (tool: string, args: unknown, result: ToolResultLike) =>
        tools?.get?.(tool, activeAgent)?.presentResult?.(args, result),
      cwd: () => currentCwd,
    }),
    { resolve: toolViewOf, cwd: () => currentCwd, ledger },
  )

  async function selectModel(provider: string, name: string): Promise<void> {
    const resolved = await llm.resolveCallConfig({ provider, model: name })
    selectionFor(activeAgent).current = selectionWithEffort(resolved)
    try {
      await ctx.agentDefaultModel.saveSelection(resolved)
    } catch (cause) {
      warn('model', 'failed to persist the default model selection', {
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
    efforts.invalidate()
    void refreshEffortNames()
  }

  async function listEfforts(): Promise<EffortSummary[]> {
    return efforts.get()
  }

  function currentEffort(): string | undefined {
    return currentSelection()?.reasoningEffort
  }

  function effortName(): string | undefined {
    const selection = currentSelection()
    if (selection === undefined || selection.reasoningEffort === undefined) return undefined
    return effortNames.get(`${selection.provider}/${selection.model}/${selection.reasoningEffort}`)
      ?? String(selection.reasoningEffort)
  }

  async function selectEffort(id: string): Promise<void> {
    const current = currentSelection()
    if (current === undefined || current.reasoningEffort === id) return
    const resolved = await llm.resolveCallConfig({
      provider: current.provider,
      model: current.model,
      reasoningEffort: ReasoningEffortId(id),
    })
    selectionFor(activeAgent).current = selectionWithEffort(resolved)
    try {
      await ctx.agentDefaultModel.saveSelection(resolved)
    } catch (cause) {
      warn('model', 'failed to persist the default effort selection', {
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
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
      } catch {
        // Projection snapshots may throw for sessions without token rows; stats fall back to zeros.
      }
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

  void refreshEffortNames()
  void modelsList.get().catch(() => {})

  return {
    modelName: () => currentSelection()?.model ?? '',
    send(text: string, images?: ReadonlyArray<readonly PendingImage[]>) {
      const hasText = text !== ''
      sendContent(activeAgent, text, hasText, images ?? [], ctx)
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
      const controller = new AbortController()
      try {
        await commandsService.execute(activeAgent, line, [], controller.signal)
      } catch {
        // Command failures already surface as session events; nothing further to report here.
      }
    },
    listSessions,
    onSessionListChanged: listener => sessionList.onRefresh(listener),
    openSession,
    newSession,
    archiveSession,
    activeSessionId: () => String(activeAgent.id),
    listModels: () => modelsList.get(),
    selectModel,
    fetchCustomModels: form => fetchCustomModels(llm, form),
    saveCustomProvider: async (form, models) => {
      await saveCustomProvider(ctx.settings, ctx.credentials, form, models)
      modelsList.clear()
    },
    listProviderDirectory: async () => listProviderDirectory(llm),
    fetchProviderModels: async (provider, apiKey) => {
      try {
        return await fetchProviderModels(llm, provider.settingsNs, provider.provider, apiKey)
      } catch (error) {
        if ((error as { code?: string }).code === 'NO_DISCOVERY') return undefined
        throw error
      }
    },
    saveProviderKey: async (provider, apiKey) => {
      await saveProviderKey(ctx.settings, ctx.credentials, provider, apiKey)
      modelsList.clear()
    },
    saveProviderModels: async (provider, models) => {
      await saveProviderModels(ctx.settings, provider, models)
      modelsList.clear()
    },
    deleteProvider: async provider => {
      const settings = settingsService()
      await deleteProviderProfile(settings, ctx.credentials, provider)
      modelsList.clear()
    },
    readModelEntries: (ns, provider) => readModelEntries(settingsService(), ns, provider),
    describeModel,
    saveModelEntry: async (ns, provider, entry) => {
      const settings = settingsService()
      const resolved = resolveModelEntryEfforts(settings, ns, provider, entry)
      await saveModelEntry(settings, settings, ns, provider, resolved)
      modelsList.clear()
      efforts.invalidate()
    },
    deleteModelEntry: async (ns, provider, modelId) => {
      const settings = settingsService()
      await deleteModelEntry(settings, settings, ns, provider, modelId)
      modelsList.clear()
    },
    cwd: () => currentCwd,
    listPresets: () => presetsList.get(),
    currentPreset,
    presetName: () => builtInPresetName(currentPreset()) ?? currentPreset(),
    selectPreset,
    listEfforts,
    currentEffort,
    effortName,
    selectEffort,
    permissionMode: () => permission()?.current(activeAgent.session) ?? PERMISSION_PRESETS[0],
    cyclePermission: () => {
      const service = permission()
      if (service === undefined) return
      try {
        const current = service.current(activeAgent.session)
        const names = service.names.length > 0 ? service.names : PERMISSION_PRESETS
        const index = names.indexOf(current)
        const next = names[(index + 1) % names.length]
        service.set(activeAgent.session, next)
      } catch (error) {
        console.error(`dshtui: permission mode switch rejected: ${error instanceof Error ? error.message : String(error)}`)
      }
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
    themePreference: () => themeMode(),
    setThemePreference: async mode => {
      applyTheme(mode)
      await settingsService().update(THEME_SETTINGS_NAMESPACE, { mode })
    },
    tokenStats,
    toolPresenter,
    interactions,
    dispose() {
      interactionChannels?.()
      interactions.dispose()
      offSessionEvents()
    },
  }
}

interface WorkspaceRegistryLike {
  create?(path: string): Promise<unknown>
  archiveSession?(sessionId: SessionId): Promise<void>
}

interface InjectHost {
  inject?(deps: readonly string[], callback: (child: Context) => void): unknown
}

/**
 * Wait for the workspace registry without gating plugin apply: its upstream
 * startup header index walks every persisted log header, so on large
 * histories it is ready seconds after the interface can paint. The registry
 * object exists before init, so the inject fork is the only readiness signal.
 */
async function registerWorkspace(ctx: Context, path: string): Promise<WorkspaceRegistryLike | undefined> {
  try {
    const workspace = await new Promise<WorkspaceRegistryLike | undefined>(resolve => {
      ;(ctx as InjectHost).inject?.(['workspaceRegistry'], child => {
        resolve((child as { workspaceRegistry?: WorkspaceRegistryLike }).workspaceRegistry)
      })
    })
    await workspace?.create?.(path)
    return workspace
  } catch (cause) {
    // A session without a registered workspace still runs; the picker labels it ungrouped.
    warn('workspace', 'failed to register the session workspace', {
      path,
      message: cause instanceof Error ? cause.message : String(cause),
    })
    return undefined
  }
}