import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'

export interface ConfiguredModel {
  id: string
  name: string
  provider: string
  providerName: string
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
  return llm.listConfigurableProviders()
    .filter(entry => entry.declared === false)
    .map(entry => ({
      provider: entry.provider,
      displayName: entry.displayName,
      settingsNs: entry.settingsNs,
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

export function providerKeyRef(providerId: string): string {
  return `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}