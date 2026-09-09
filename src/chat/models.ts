import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { resolveReasoningEfforts } from './effort-inference.ts'

export interface ConfiguredModel {
  id: string
  name: string
  provider: string
  providerName: string
}

export type ModelEffortKey = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelEntryConfig {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  reasoningEfforts?: false | Partial<Record<ModelEffortKey, string | null>>
  compat?: Record<string, unknown>
}

export interface DescribedModel {
  name: string
  contextWindow?: number
  image: boolean
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
  settingsPath: readonly string[]
  declared?: boolean
}

export const API_PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages']

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
    settingsPath: entry.settingsPath,
    ...(entry.declared === undefined ? {} : { declared: entry.declared }),
  }))
}

export interface KeyStorer {
  set(ref: string, value: string): Promise<void>
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

/**
 * Declaring a model reasoning changes how pi-ai encodes the system prompt:
 * with an unresolved supportsDeveloperRole it sends OpenAI's `developer` role,
 * which strict OpenAI-compatible relays reject. Pin `system` on every inferred
 * entry — every such endpoint accepts `system` — except protocols whose schema
 * refuses the field. An explicitly set value always wins.
 */
function compatForInferredEntry(api: string, existing: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (api === 'anthropic-messages' || existing?.supportsDeveloperRole !== undefined) return undefined
  return { ...(existing ?? {}), supportsDeveloperRole: false }
}

/**
 * One-shot capability resolution at save time: a model the models.dev snapshot
 * knows gets its reasoningEfforts written once, here. Later saves must not
 * second-guess an existing declaration — an explicit map or `false` wins.
 */
function withInferredEfforts(api: string, baseURL: string, models: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return models.map(model => {
    if (typeof model.id !== 'string' || model.reasoningEfforts !== undefined) return model
    const efforts = resolveReasoningEfforts(baseURL, model.id)
    if (efforts === undefined || Object.keys(efforts).length === 0) return model
    const compat = compatForInferredEntry(api, model.compat as Record<string, unknown> | undefined)
    return { ...model, reasoningEfforts: efforts, ...(compat === undefined ? {} : { compat }) }
  })
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
        models: withInferredEfforts(form.apiProtocol, form.apiUrl, storedModels(models)),
      },
    },
  })
}

function patchAtPath(patch: object, path: readonly string[]): object {
  const root: Record<string, unknown> = {}
  let cursor = root
  for (const segment of path) {
    const next: Record<string, unknown> = {}
    cursor[segment] = next
    cursor = next
  }
  Object.assign(cursor, patch)
  return root
}

export async function saveProviderKey(
  write: SettingsWriter,
  store: KeyStorer,
  provider: OfficialProvider,
  apiKey: string,
): Promise<void> {
  if (apiKey.trim() === '') throw new Error('API key must not be empty')
  const keyRef = providerKeyRef(provider.provider)
  await store.set(keyRef, apiKey)
  await write.update(provider.settingsNs, patchAtPath({ apiKeyEnv: keyRef }, provider.settingsPath))
}

export async function saveProviderModels(
  write: SettingsWriter,
  provider: OfficialProvider,
  models: LlmDiscoveredModel[],
): Promise<void> {
  await write.update(provider.settingsNs, patchAtPath({ models: storedModels(models) }, provider.settingsPath))
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

/**
 * Lazy backfill for model entries saved before the capability snapshot existed.
 * The entry must be hand-declared, carry no reasoning declaration at all, and
 * belong to a provider whose api and baseURL are both declared; anything else
 * is returned untouched. Resolution is pure — persisting is the caller's job.
 */
export function resolveModelEntryEfforts(
  reader: SettingsReader,
  ns: string,
  provider: string,
  entry: ModelEntryConfig,
): ModelEntryConfig {
  if (entry.reasoningEfforts !== undefined) return entry
  const profile = providerSection(reader, ns, provider)
  const api = typeof profile?.api === 'string' ? profile.api : undefined
  const baseURL = typeof profile?.baseURL === 'string' ? profile.baseURL : undefined
  if (api === undefined || baseURL === undefined) return entry
  const efforts = resolveReasoningEfforts(baseURL, entry.id)
  if (efforts === undefined || Object.keys(efforts).length === 0) return entry
  const compat = compatForInferredEntry(api, entry.compat)
  return { ...entry, reasoningEfforts: efforts, ...(compat === undefined ? {} : { compat }) }
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

export type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

export interface SettingsMutator {
  get(ns: string): unknown
  mutate(ns: string, ops: readonly SettingsPathOp[]): Promise<void>
}

export interface KeyRemover {
  unset(ref: string): Promise<void>
  describe(ref: string): Promise<{ configured: boolean; writable: boolean }>
}

/**
 * Delete one adapter-declared provider profile through the harness's official
 * write path: path-addressed `unset` on the owning settings namespace, plus
 * credential removal when the profile stores its key under the conventional
 * managed reference. Mirrors the web bundle's removeProviderProfile.
 */
export async function deleteProviderProfile(
  settings: SettingsMutator,
  store: KeyRemover,
  provider: OfficialProvider,
): Promise<void> {
  if (provider.declared !== true) throw new Error('only custom providers can be deleted')
  const managedRef = providerKeyRef(provider.provider)
  const profile = providerSection(settings, provider.settingsNs, provider.provider)
  const apiKeyEnv = typeof profile?.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined
  if (apiKeyEnv === managedRef) {
    const info = await store.describe(managedRef).catch(() => undefined)
    if (info?.configured === true && info.writable) await store.unset(managedRef)
  }
  await settings.mutate(provider.settingsNs, [{ op: 'unset', path: [...provider.settingsPath] }])
}