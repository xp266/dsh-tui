import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import {
  deleteModelEntry,
  deleteProviderProfile,
  fetchCustomModels,
  fetchProviderModels,
  isProviderIdValid,
  listConfiguredModels,
  listProviderDirectory,
  providerKeyRef,
  readModelEntries,
  saveCustomProvider,
  saveModelEntry,
  saveProviderKey,
  saveProviderModels,
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

  it('lists every configurable provider from the directory preserving declaration flags', () => {
    const llm = {
      listConfigurableProviders: () => [
        { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
        { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'amazon-bedrock'], declared: false },
        { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], declared: false },
        { provider: 'opencodezen', displayName: 'opencodeZen', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'opencodezen'], declared: true },
      ],
    }
    expect(listProviderDirectory(llm)).toEqual([
      { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] },
      { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'amazon-bedrock'], declared: false },
      { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], declared: false },
      { provider: 'opencodezen', displayName: 'opencodeZen', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'opencodezen'], declared: true },
    ])
  })
  it('fetches provider models by route id and omits a blank key', async () => {
    const fetcher = { discoverModels: vi.fn(async (_ns: string, _request: object) => [{ id: 'm1' }]) }
    const provider: OfficialProvider = { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'amazon-bedrock'] }
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

  it('saves a provider key under a credential ref at the settings path', async () => {
    const write = { update: vi.fn(async (_ns: string, _patch: unknown) => {}) }
    const store = { set: vi.fn(async () => {}) }
    const nested: OfficialProvider = { provider: 'minimax-cn', displayName: 'minimax-cn', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'minimax-cn'] }
    await saveProviderKey(write, store, nested, 'key-9')
    expect(store.set).toHaveBeenCalledWith('MINIMAX_CN_API_KEY', 'key-9')
    expect(write.update).toHaveBeenCalledWith('llm-pi-ai', {
      providers: { 'minimax-cn': { apiKeyEnv: 'MINIMAX_CN_API_KEY' } },
    })
    const flat: OfficialProvider = { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }
    await saveProviderKey(write, store, flat, 'sk-1')
    expect(write.update).toHaveBeenCalledWith('llm-deepseek', { apiKeyEnv: 'DEEPSEEK_OFFICIAL_API_KEY' })
  })

  it('rejects a blank provider key', async () => {
    const write = { update: vi.fn(async (_ns: string, _patch: unknown) => {}) }
    const store = { set: vi.fn(async () => {}) }
    const provider: OfficialProvider = { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'amazon-bedrock'] }
    await expect(saveProviderKey(write, store, provider, '  ')).rejects.toThrow('API key must not be empty')
    expect(store.set).not.toHaveBeenCalled()
    expect(write.update).not.toHaveBeenCalled()
  })

  it('saves picked models at the settings path', async () => {
    const write = { update: vi.fn(async (_ns: string, _patch: unknown) => {}) }
    const models: LlmDiscoveredModel[] = [{ id: 'abab6.5s-chat', name: 'abab6.5s', contextWindow: 245760 }]
    const nested: OfficialProvider = { provider: 'minimax-cn', displayName: 'minimax-cn', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'minimax-cn'] }
    await saveProviderModels(write, nested, models)
    expect(write.update).toHaveBeenCalledWith('llm-pi-ai', {
      providers: { 'minimax-cn': { models: [{ id: 'abab6.5s-chat', name: 'abab6.5s', contextWindow: 245760 }] } },
    })
    const flat: OfficialProvider = { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [] }
    await saveProviderModels(write, flat, [{ id: 'm1' }])
    expect(write.update).toHaveBeenCalledWith('llm-deepseek', { models: [{ id: 'm1' }] })
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

describe('deleteProviderProfile', () => {
  const custom: OfficialProvider = {
    provider: 'my-gw',
    displayName: 'My Gateway',
    settingsNs: 'llm-pi-ai',
    settingsPath: ['providers', 'my-gw'],
    declared: true,
  }

  function fakeSettings(section: unknown) {
    return {
      get: vi.fn(() => section),
      mutate: vi.fn(async () => {}),
    }
  }

  function fakeStore(info: { configured: boolean; writable: boolean }) {
    return {
      unset: vi.fn(async () => {}),
      describe: vi.fn(async () => info),
    }
  }

  it('unsets the managed credential and removes the profile', async () => {
    const settings = fakeSettings({ providers: { 'my-gw': { displayName: 'My Gateway', apiKeyEnv: 'MY_GW_API_KEY' } } })
    const store = fakeStore({ configured: true, writable: true })
    await deleteProviderProfile(settings, store, custom)
    expect(store.unset).toHaveBeenCalledWith('MY_GW_API_KEY')
    expect(settings.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'unset', path: ['providers', 'my-gw'] }])
  })

  it('leaves a foreign credential reference alone and still removes the profile', async () => {
    const settings = fakeSettings({ providers: { 'my-gw': { apiKeyEnv: 'MY_OWN_ENV_VAR' } } })
    const store = fakeStore({ configured: true, writable: true })
    await deleteProviderProfile(settings, store, custom)
    expect(store.unset).not.toHaveBeenCalled()
    expect(store.describe).not.toHaveBeenCalled()
    expect(settings.mutate).toHaveBeenCalledTimes(1)
  })

  it('skips credential removal when the reference is not writable', async () => {
    const settings = fakeSettings({ providers: { 'my-gw': { apiKeyEnv: 'MY_GW_API_KEY' } } })
    const store = fakeStore({ configured: true, writable: false })
    await deleteProviderProfile(settings, store, custom)
    expect(store.unset).not.toHaveBeenCalled()
    expect(settings.mutate).toHaveBeenCalledTimes(1)
  })

  it('removes the profile even without a stored credential', async () => {
    const settings = fakeSettings({ providers: {} })
    const store = fakeStore({ configured: false, writable: true })
    await deleteProviderProfile(settings, store, custom)
    expect(store.unset).not.toHaveBeenCalled()
    expect(settings.mutate).toHaveBeenCalledTimes(1)
  })

  it('rejects deleting an adapter-owned provider', async () => {
    const settings = fakeSettings(undefined)
    const store = fakeStore({ configured: false, writable: true })
    await expect(deleteProviderProfile(settings, store, { ...custom, declared: false })).rejects.toThrow('only custom providers can be deleted')
    expect(settings.mutate).not.toHaveBeenCalled()
    expect(store.unset).not.toHaveBeenCalled()
  })
})
