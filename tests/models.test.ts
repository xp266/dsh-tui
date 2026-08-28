import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import {
  addDeepSeekKey,
  DEEPSEEK_KEY_REF,
  deleteModelEntry,
  fetchCustomModels,
  fetchProviderModels,
  isProviderIdValid,
  listConfiguredModels,
  listProviderDirectory,
  providerKeyRef,
  readModelEntries,
  saveBuiltinProvider,
  saveCustomProvider,
  saveModelEntry,
} from '../src/chat/models.ts'
import type { CustomProviderForm, OfficialProvider } from '../src/chat/models.ts'

describe('model management', () => {
  it('lists configured models across providers', async () => {
    const llm = {
      listProviders: () => [
        { id: 'zai', name: 'zai' },
        { id: 'deepseek-official', name: 'DeepSeek' },
      ],
      listModels: vi.fn(async (provider: string) =>
        provider === 'zai'
          ? [{ provider: 'zai', id: 'glm-4.7-flash', name: 'glm-4.7-flash', inputModalities: ['text' as const] }]
          : [{ provider: 'deepseek-official', id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', inputModalities: ['text' as const] }],
      ),
    }
    const models = await listConfiguredModels(llm)
    expect(models).toEqual([
      { id: 'glm-4.7-flash', name: 'glm-4.7-flash', provider: 'zai', providerName: 'zai' },
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', provider: 'deepseek-official', providerName: 'DeepSeek' },
    ])
  })

  it('stores the DeepSeek key under the official env ref', async () => {
    const store = { set: vi.fn(async () => {}) }
    await addDeepSeekKey(store, 'sk-123')
    expect(store.set).toHaveBeenCalledWith(DEEPSEEK_KEY_REF, 'sk-123')
  })

  it('fetches custom provider models through discovery', async () => {
    const fetcher = { discoverModels: vi.fn(async () => [{ id: 'm1' }]) }
    const form: CustomProviderForm = {
      providerId: 'acme',
      displayName: 'Acme',
      apiUrl: 'https://acme.example/v1',
      apiProtocol: 'openai-completions',
      apiKey: 'k',
    }
    const models = await fetchCustomModels(fetcher, form)
    expect(models).toEqual([{ id: 'm1' }])
    expect(fetcher.discoverModels).toHaveBeenCalledWith(
      'llm-pi-ai',
      expect.objectContaining({ baseURL: 'https://acme.example/v1', api: 'openai-completions', apiKey: 'k' }),
    )
  })

  it('saves a custom provider with credential and model list', async () => {
    const write = { update: vi.fn(async () => {}) }
    const store = { set: vi.fn(async () => {}) }
    const form: CustomProviderForm = {
      providerId: 'my-gw',
      displayName: 'My Gateway',
      apiUrl: 'https://gw.example/v1',
      apiProtocol: 'openai-completions',
      apiKey: 'key-1',
    }
    const models: LlmDiscoveredModel[] = [
      { id: 'm1', name: 'Model One', contextWindow: 131072 },
      { id: 'm2', maxTokens: 4096 },
    ]
    await saveCustomProvider(write, store, form, models)
    expect(store.set).toHaveBeenCalledWith('MY_GW_API_KEY', 'key-1')
    expect(write.update).toHaveBeenCalledWith('llm-pi-ai', {
      providers: {
        'my-gw': {
          displayName: 'My Gateway',
          api: 'openai-completions',
          baseURL: 'https://gw.example/v1',
          apiKeyEnv: 'MY_GW_API_KEY',
          models: [
            { id: 'm1', name: 'Model One', contextWindow: 131072 },
            { id: 'm2', maxTokens: 4096 },
          ],
        },
      },
    })
  })

  it('omits the key ref when no api key is given', async () => {
    const write = { update: vi.fn(async (_ns: string, _patch: unknown) => {}) }
    const store = { set: vi.fn(async () => {}) }
    const form: CustomProviderForm = {
      providerId: 'anon',
      displayName: '',
      apiUrl: 'https://anon.example/v1',
      apiProtocol: 'openai-completions',
      apiKey: '',
    }
    await saveCustomProvider(write, store, form, [{ id: 'm1' }])
    expect(store.set).not.toHaveBeenCalled()
    const patch = write.update.mock.calls[0]?.[1] as unknown as { providers: Record<string, object> }
    expect(patch.providers.anon).not.toHaveProperty('apiKeyEnv')
    expect(patch.providers.anon).toMatchObject({ displayName: 'anon' })
  })

  it('derives a stable credential ref from the provider id', () => {
    expect(providerKeyRef('my-gw')).toBe('MY_GW_API_KEY')
    expect(providerKeyRef('zai')).toBe('ZAI_API_KEY')
  })

  it('rejects a provider id whose credential ref cannot be a shell identifier', async () => {
    expect(() => providerKeyRef('9r')).toThrow('9R_API_KEY')
    expect(isProviderIdValid('9r')).toBe(false)
    expect(isProviderIdValid('nine-r')).toBe(true)
    expect(isProviderIdValid('')).toBe(false)
    const write = { update: vi.fn(async () => {}) }
    const store = { set: vi.fn(async () => {}) }
    const form: CustomProviderForm = {
      providerId: '9r',
      displayName: '9r',
      apiUrl: 'https://nine.example/v1',
      apiProtocol: 'openai-completions',
      apiKey: 'k',
    }
    await expect(saveCustomProvider(write, store, form, [{ id: 'm1' }])).rejects.toThrow('9R_API_KEY')
    expect(store.set).not.toHaveBeenCalled()
    expect(write.update).not.toHaveBeenCalled()
  })

  it('lists only adapter-shipped providers from the directory', () => {
    const llm = {
      listConfigurableProviders: () => [
        { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
        { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'amazon-bedrock'], declared: false },
        { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], declared: false },
        { provider: 'opencodezen', displayName: 'opencodeZen', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'opencodezen'], declared: true },
      ],
    }
    expect(listProviderDirectory(llm)).toEqual([
      { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai' },
      { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai' },
    ])
  })
  it('fetches provider models by route id and omits a blank key', async () => {
    const fetcher = { discoverModels: vi.fn(async (_ns: string, _request: object) => [{ id: 'm1' }]) }
    const provider: OfficialProvider = { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai' }
    await fetchProviderModels(fetcher, provider.settingsNs, provider.provider, '')
    expect(fetcher.discoverModels).toHaveBeenCalledWith(
      'llm-pi-ai',
      expect.objectContaining({ provider: 'amazon-bedrock' }),
    )
    const request = fetcher.discoverModels.mock.calls[0]?.[1] as unknown as Record<string, unknown>
    expect(request).not.toHaveProperty('apiKey')
    await fetchProviderModels(fetcher, provider.settingsNs, provider.provider, 'k')
    expect(fetcher.discoverModels).toHaveBeenLastCalledWith(
      'llm-pi-ai',
      expect.objectContaining({ provider: 'amazon-bedrock', apiKey: 'k' }),
    )
  })

  it('saves a builtin provider with credential and picked models', async () => {
    const write = { update: vi.fn(async (_ns: string, _patch: unknown) => {}) }
    const store = { set: vi.fn(async () => {}) }
    const provider: OfficialProvider = { provider: 'minimax-cn', displayName: 'minimax-cn', settingsNs: 'llm-pi-ai' }
    const models: LlmDiscoveredModel[] = [{ id: 'abab6.5s-chat', name: 'abab6.5s', contextWindow: 245760 }]
    await saveBuiltinProvider(write, store, provider, 'key-9', models)
    expect(store.set).toHaveBeenCalledWith('MINIMAX_CN_API_KEY', 'key-9')
    expect(write.update).toHaveBeenCalledWith('llm-pi-ai', {
      providers: {
        'minimax-cn': {
          apiKeyEnv: 'MINIMAX_CN_API_KEY',
          models: [{ id: 'abab6.5s-chat', name: 'abab6.5s', contextWindow: 245760 }],
        },
      },
    })
  })

  it('omits the key ref when saving a builtin provider without a key', async () => {
    const write = { update: vi.fn(async (_ns: string, _patch: unknown) => {}) }
    const store = { set: vi.fn(async () => {}) }
    const provider: OfficialProvider = { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai' }
    await saveBuiltinProvider(write, store, provider, '', [{ id: 'm1' }])
    expect(store.set).not.toHaveBeenCalled()
    const patch = write.update.mock.calls[0]?.[1] as unknown as { providers: Record<string, object> }
    expect(patch.providers['amazon-bedrock']).not.toHaveProperty('apiKeyEnv')
    expect(patch.providers['amazon-bedrock']).toMatchObject({ models: [{ id: 'm1' }] })
  })
})
describe('model entry settings', () => {
  const reader = {
    get: (ns: string) => ({
      providers: {
        NineR: {
          displayName: 'NineR',
          models: [
            { id: 'a', contextWindow: 1000 },
            { id: 'b' },
          ],
        },
      },
    }),
  }

  it('reads model entries from the settings namespace', () => {
    expect(readModelEntries(reader, 'llm-pi-ai', 'NineR')).toEqual([
      { id: 'a', contextWindow: 1000 },
      { id: 'b' },
    ])
    expect(readModelEntries(reader, 'llm-pi-ai', 'missing')).toEqual([])
  })

  it('replaces an existing entry on save and appends a new one', async () => {
    const write = { update: vi.fn(async () => {}) }
    await saveModelEntry(write, reader, 'llm-pi-ai', 'NineR', { id: 'b', maxTokens: 99 })
    expect(write.update).toHaveBeenCalledWith('llm-pi-ai', {
      providers: { NineR: { models: [{ id: 'a', contextWindow: 1000 }, { id: 'b', maxTokens: 99 }] } },
    })
    await saveModelEntry(write, reader, 'llm-pi-ai', 'NineR', { id: 'c' })
    expect(write.update).toHaveBeenLastCalledWith('llm-pi-ai', {
      providers: { NineR: { models: [{ id: 'a', contextWindow: 1000 }, { id: 'b' }, { id: 'c' }] } },
    })
  })

  it('deletes one entry while keeping the rest of the provider profile', async () => {
    const write = { update: vi.fn(async () => {}) }
    await deleteModelEntry(write, reader, 'llm-pi-ai', 'NineR', 'a')
    expect(write.update).toHaveBeenCalledWith('llm-pi-ai', {
      providers: { NineR: { models: [{ id: 'b' }] } },
    })
    await deleteModelEntry(write, reader, 'llm-pi-ai', 'NineR', 'missing')
    expect(write.update).toHaveBeenCalledTimes(1)
  })
})
