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

export interface ModelSaver {
  saveSelection(selection: { provider: string; model: string }): Promise<void>
}

export async function selectModel(saver: ModelSaver, provider: string, model: string): Promise<void> {
  await saver.saveSelection({ provider, model })
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
    request: { baseURL: string; api?: string; apiKey?: string; signal?: AbortSignal },
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

export interface SettingsWriter {
  update(ns: string, patch: unknown, expectedRevision?: number | null): Promise<unknown>
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
        models: models.map(model => ({
          id: model.id,
          ...(model.name === undefined ? {} : { name: model.name }),
          ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
          ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
        })),
      },
    },
  })
}

export function providerKeyRef(providerId: string): string {
  return `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}