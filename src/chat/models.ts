import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'

export interface ConfiguredModel {
  id: string
  name: string
  provider: string
  providerName: string
}

export type ModelEffortKey = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const MODEL_EFFORT_LEVELS: readonly ModelEffortKey[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export interface ModelEntryConfig {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  reasoningEfforts?: false | Partial<Record<ModelEffortKey, string | null>>
}

export interface ConfiguredModelDetail extends ConfiguredModel {
  settingsNs: string
  contextWindow?: number
  maxTokens?: number
  reasoningEfforts?: false | Partial<Record<ModelEffortKey, string | null>>
}

export interface CustomProviderForm {
  providerId: string
  displayName: string
  apiUrl: string
  apiProtocol: string
  apiKey: string
}

export interface OfficialProvider {
  provider: string
  displayName: string
  settingsNs: string
  declared?: boolean
}

export const API_PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages']

export const DEEPSEEK_KEY_REF = 'DEEPSEEK_API_KEY'

export const PI_AI_SETTINGS_NS = 'llm-pi-ai'

export async function listConfiguredModels(llm: Pick<LlmRuntime, 'listProviders' | 'listModels'>): Promise<ConfiguredModel[]> {
  const models: ConfiguredModel[] = []
  for (const provider of llm.listProviders()) {
    const list = await llm.listModels(provider.id)
    for (const model of list) {
      models.push({ id: model.id, name: model.name ?? model.id, provider: provider.id, providerName: provider.name })
    }
  }
  return models
}

export function listProviderDirectory(llm: Pick<LlmRuntime, 'listConfigurableProviders'>): OfficialProvider[] {
  return llm.listConfigurableProviders().map(entry => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: entry.settingsNs,
    ...(entry.declared === undefined ? {} : { declared: entry.declared }),
  }))
}

export interface KeyStorer {
  set(ref: string, value: string): Promise<void>
}

export async function addDeepSeekKey(store: KeyStorer, apiKey: string): Promise<void> {
  await store.set(DEEPSEEK_KEY_REF, apiKey)
}

export interface ModelFetcher {
  discoverModels(
    ns: string,
    request: { provider?: string; baseURL?: string; api?: string; apiKey?: string; signal?: AbortSignal },
  ): Promise<LlmDiscoveredModel[]>
}

const DISCOVERY_TIMEOUT_MS = 15000

export async function fetchCustomModels(fetcher: ModelFetcher, form: CustomProviderForm): Promise<LlmDiscoveredModel[]> {
  return fetcher.discoverModels(PI_AI_SETTINGS_NS, {
    baseURL: form.apiUrl,
    api: form.apiProtocol,
    apiKey: form.apiKey,
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  })
}

export async function fetchProviderModels(fetcher: ModelFetcher, settingsNs: string, providerId: string, apiKey: string): Promise<LlmDiscoveredModel[]> {
  return fetcher.discoverModels(settingsNs, {
    provider: providerId,
    ...(apiKey.length > 0 ? { apiKey } : {}),
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  })
}

export interface SettingsWriter {
  update(ns: string, patch: unknown, expectedRevision?: number | null): Promise<unknown>
}

function storedModels(models: LlmDiscoveredModel[]): Array<Record<string, unknown>> {
  return models.map(model => ({
    id: model.id,
    ...(model.name === undefined ? {} : { name: model.name }),
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
  }))
}

export async function saveCustomProvider(
  write: SettingsWriter,
  store: KeyStorer,
  form: CustomProviderForm,
  models: LlmDiscoveredModel[],
): Promise<void> {
  const keyRef = providerKeyRef(form.providerId)
  if (form.apiKey.length > 0) await store.set(keyRef, form.apiKey)
  await write.update(PI_AI_SETTINGS_NS, {
    providers: {
      [form.providerId]: {
        displayName: form.displayName || form.providerId,
        api: form.apiProtocol,
        baseURL: form.apiUrl,
        ...(form.apiKey.length > 0 ? { apiKeyEnv: keyRef } : {}),
        models: storedModels(models),
      },
    },
  })
}

export async function saveBuiltinProvider(
  write: SettingsWriter,
  store: KeyStorer,
  provider: OfficialProvider,
  apiKey: string,
  models: LlmDiscoveredModel[],
): Promise<void> {
  const keyRef = providerKeyRef(provider.provider)
  if (apiKey.length > 0) await store.set(keyRef, apiKey)
  await write.update(provider.settingsNs, {
    providers: {
      [provider.provider]: {
        ...(apiKey.length > 0 ? { apiKeyEnv: keyRef } : {}),
        models: storedModels(models),
      },
    },
  })
}

const KEY_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const PROVIDER_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

export function isProviderIdValid(providerId: string): boolean {
  return PROVIDER_ID_PATTERN.test(providerId)
}

export function providerKeyRef(providerId: string): string {
  const ref = `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
  if (!KEY_REF_PATTERN.test(ref)) {
    throw new Error(`provider id "${providerId}" produces invalid credential ref "${ref}"; use a name starting with a letter`)
  }
  return ref
}

export interface SettingsReader {
  get(ns: string): unknown
}

export interface ModelSettingsPatch {
  apiKeyEnv?: string
  models?: ModelEntryConfig[]
}

function providerSection(reader: SettingsReader, ns: string, provider: string): Record<string, unknown> | undefined {
  const section = reader.get(ns)
  if (section === undefined || typeof section !== 'object') return undefined
  const providers = (section as { providers?: Record<string, unknown> }).providers
  if (providers === undefined || typeof providers !== 'object') return undefined
  const profile = providers[provider]
  if (profile === undefined || typeof profile !== 'object') return undefined
  return profile as Record<string, unknown>
}

export function readModelEntries(reader: SettingsReader, ns: string, provider: string): ModelEntryConfig[] {
  const profile = providerSection(reader, ns, provider)
  const models = profile?.models
  if (!Array.isArray(models)) return []
  return models.filter((entry): entry is ModelEntryConfig =>
    typeof entry === 'object' && entry !== null && typeof (entry as ModelEntryConfig).id === 'string')
}

export async function saveModelEntry(
  write: SettingsWriter,
  reader: SettingsReader,
  ns: string,
  provider: string,
  entry: ModelEntryConfig,
): Promise<void> {
  const models = readModelEntries(reader, ns, provider)
  const index = models.findIndex(model => model.id === entry.id)
  const next = [...models]
  if (index >= 0) next[index] = entry
  else next.push(entry)
  await write.update(ns, { providers: { [provider]: { models: next } } })
}

export async function deleteModelEntry(
  write: SettingsWriter,
  reader: SettingsReader,
  ns: string,
  provider: string,
  modelId: string,
): Promise<void> {
  const models = readModelEntries(reader, ns, provider)
  const next = models.filter(model => model.id !== modelId)
  if (next.length === models.length) return
  await write.update(ns, { providers: { [provider]: { models: next } } })
}