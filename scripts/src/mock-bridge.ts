import { InteractionStore } from '../../src/chat/interactions.ts'
import type { AskUserQuestionRequestLike } from '../../src/chat/interactions.ts'
import type { ConfiguredModel } from '../../src/chat/models.ts'
import type { PresetSummary } from '../../src/chat/presets.ts'
import type { EffortSummary } from '../../src/chat/efforts.ts'
import type { SessionSummary } from '../../src/chat/session-list.ts'

const MOCK_MODELS: ConfiguredModel[] = [
  { id: 'deepseek-v4', name: 'deepseek-v4', provider: 'deepseek', providerName: 'DeepSeek' },
  { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', provider: 'deepseek', providerName: 'DeepSeek' },
  { id: 'deepseek-r2', name: 'deepseek-r2', provider: 'deepseek', providerName: 'DeepSeek' },
]

const MOCK_PRESETS: PresetSummary[] = [
  { id: 'default', name: 'Default' },
  { id: 'coder', name: 'Coder' },
  { id: 'reviewer', name: 'Code Reviewer' },
]

const MOCK_EFFORTS: EffortSummary[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
]

function mockSessions(): SessionSummary[] {
  const now = Date.now()
  return [
    { id: 's-1', name: 'Refactor screen parser into shared grid module', directory: '~/ts/dsh-tui', ungrouped: false, updatedAt: now - 3 * 60_000 },
    { id: 's-2', name: 'Investigate flaky vitest timers', directory: '~/ts/dsh-tui', ungrouped: false, updatedAt: now - 2 * 3600_000 },
    { id: 's-3', name: 'Design headless snapshot pipeline', directory: '~/ts/dsh-harness', ungrouped: false, updatedAt: now - 26 * 3600_000 },
    { id: 's-4', name: 'Add mouse selection to message area', directory: '~/ts/dsh-tui', ungrouped: false, updatedAt: now - 5 * 24 * 3600_000 },
  ]
}

export interface MockBridgeOptions {
  model?: string
  cwd?: string
  permissionMode?: string
  preset?: string
  effort?: string
  tokenStats?: { contextPercent: number; hitPercent: number; input: number; output: number }
}

export interface MockBridge {
  modelName(): string
  send(text: string): void
  interrupt(): void
  subscribe(handler: (event: unknown) => void): () => void
  emitEvent(event: unknown): void
  listSessions(): Promise<SessionSummary[]>
  openSession(id: string): Promise<void>
  newSession(): Promise<void>
  archiveSession(id: string): Promise<void>
  activeSessionId(): string
  listModels(): Promise<ConfiguredModel[]>
  selectModel(provider: string, model: string): Promise<void>
  addDeepSeekKey(apiKey: string): Promise<void>
  fetchCustomModels(form: unknown): Promise<unknown[]>
  saveCustomProvider(form: unknown, models: unknown[]): Promise<void>
  listProviderDirectory(): Promise<unknown[]>
  fetchProviderModels(provider: unknown, apiKey: string): Promise<unknown[]>
  saveBuiltinProvider(provider: unknown, apiKey: string, models: unknown[]): Promise<void>
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
  tokenStats(): { contextPercent: number; hitPercent: number; input: number; output: number }
  toolPresenter: {
    argsJson(callId: string): string | undefined
    call(name: string, callId: string, argumentsRaw: string): undefined
    result(callId: string, result: unknown): undefined
  }
  interactions: InteractionStore
}

export const SAMPLE_QUESTION: AskUserQuestionRequestLike = {
  questions: [
    {
      id: 'q1',
      header: 'Approach',
      question: 'Which migration strategy should be used for the legacy database?',
      detail: 'Pick one strategy. A custom answer is also supported.',
      options: [
        { label: 'Big bang cutover', description: 'Migrate everything in a single maintenance window.' },
        { label: 'Dual write', description: 'Write to both stores during the transition period.' },
        { label: 'Incremental backfill', description: 'Move tables one by one behind a facade.' },
      ],
    },
    {
      id: 'q2',
      header: 'Checks',
      question: 'Which extra checks should run after the migration?',
      multiSelect: true,
      options: [
        { label: 'Row count diff', description: 'Compare per-table counts before and after.' },
        { label: 'Checksum sampling' },
        { label: 'Latency probe' },
      ],
    },
  ],
}

export function createMockBridge(options: MockBridgeOptions = {}): MockBridge {
  const interactions = new InteractionStore()
  const subscribers = new Set<(event: unknown) => void>()
  return {
    modelName: () => options.model ?? 'deepseek-v4-flash',
    send: () => {},
    interrupt: () => {},
    subscribe: handler => {
      subscribers.add(handler)
      return () => subscribers.delete(handler)
    },
    emitEvent: event => {
      for (const handler of subscribers) handler(event)
    },
    listSessions: async () => mockSessions(),
    openSession: async () => {},
    newSession: async () => {},
    archiveSession: async () => {},
    activeSessionId: () => 'snapshot-session',
    listModels: async () => MOCK_MODELS,
    selectModel: async () => {},
    addDeepSeekKey: async () => {},
    fetchCustomModels: async () => [],
    saveCustomProvider: async () => {},
    listProviderDirectory: async () => [],
    fetchProviderModels: async () => [],
    saveBuiltinProvider: async () => {},
    cwd: () => options.cwd ?? process.cwd(),
    listPresets: async () => MOCK_PRESETS,
    currentPreset: () => options.preset ?? 'default',
    presetName: () => options.preset ?? 'default',
    selectPreset: async () => {},
    listEfforts: async () => MOCK_EFFORTS,
    currentEffort: () => options.effort ?? 'medium',
    effortName: () => options.effort ?? 'medium',
    selectEffort: async () => {},
    permissionMode: () => options.permissionMode ?? 'workspace-write',
    cyclePermission: () => {},
    listPermissionPresets: async () => [],
    defaultPermission: () => options.permissionMode ?? 'workspace-write',
    setDefaultPermission: async () => {},
    defaultPresetId: () => options.preset ?? 'default',
    setDefaultPreset: async () => {},
    tokenStats: () =>
      options.tokenStats ?? { contextPercent: 12, hitPercent: 64, input: 48200, output: 1830 },
    toolPresenter: {
      argsJson: () => undefined,
      call: () => undefined,
      result: () => undefined,
    } satisfies MockBridge['toolPresenter'],
    interactions,
  }
}
