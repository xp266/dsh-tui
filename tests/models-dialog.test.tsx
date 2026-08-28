import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { ModelsDialog } from '../src/ui/dialog/models-dialog.tsx'
import type { ConfiguredModel, OfficialProvider } from '../src/chat/models.ts'

const DIRECTORY: OfficialProvider[] = [
  { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai' },
  { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai' },
  { provider: 'minimax-cn', displayName: 'minimax-cn', settingsNs: 'llm-pi-ai' },
  { provider: 'zai-coding-cn', displayName: 'zai-coding-cn', settingsNs: 'llm-pi-ai' },
]

const DISCOVERED: LlmDiscoveredModel[] = [{ id: 'm1', name: 'Model One' }]

function fakeApi() {
  return {
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    addDeepSeekKey: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
    listProviderDirectory: vi.fn(async () => DIRECTORY),
    fetchProviderModels: vi.fn(async () => DISCOVERED),
    saveBuiltinProvider: vi.fn(async () => {}),
    readModelEntries: vi.fn(() => []),
    saveModelEntry: vi.fn(async () => {}),
    deleteModelEntry: vi.fn(async () => {}),
  }
}

function focusedSegment(frame: string): string {
  return frame.match(/\x1b\[7m([^\x1b]*)/)?.[1] ?? ''
}

async function until(label: string, check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`condition not met: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function frameIncludes(lastFrame: () => string | undefined, text: string): () => boolean {
  return () => (lastFrame() ?? '').includes(text)
}

async function focusItem(lastFrame: () => string | undefined, label: string): Promise<void> {
  await until(`focus on ${label}`, () => focusedSegment(lastFrame() ?? '').includes(label))
}

async function pressDownUntil(
  stdin: { write(data: string): void },
  lastFrame: () => string | undefined,
  label: string,
  attempts = 10,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await until(`${label} visible`, frameIncludes(lastFrame, label), 1000)
    if (focusedSegment(lastFrame() ?? '').includes(label)) return
    await pressDown(stdin)
  }
  throw new Error(`focus never reached: ${label}`)
}

async function pressDown(stdin: { write(data: string): void }): Promise<void> {
  act(() => {
    stdin.write('\u001b[B')
  })
  await new Promise(resolve => setTimeout(resolve, 25))
}

async function pressEnter(stdin: { write(data: string): void }): Promise<void> {
  act(() => {
    stdin.write('\r')
  })
  await new Promise(resolve => setTimeout(resolve, 25))
}

async function pressEnterUntil(
  stdin: { write(data: string): void },
  label: string,
  check: () => boolean,
  attempts = 4,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await pressEnter(stdin)
    try {
      await until(label, check, 350)
      return
    } catch {
    }
  }
  throw new Error(`enter had no effect: ${label}`)
}

async function pressKeyUntil(
  key: string,
  stdin: { write(data: string): void },
  label: string,
  check: () => boolean,
  attempts = 4,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    act(() => {
      stdin.write(key)
    })
    await new Promise(resolve => setTimeout(resolve, 25))
    try {
      await until(label, check, 350)
      return
    } catch {
    }
  }
  throw new Error(`key had no effect: ${label}`)
}

async function openDirectory(
  lastFrame: () => string | undefined,
  stdin: { write(data: string): void },
): Promise<void> {
  await until('main list shows add rows', frameIncludes(lastFrame, '+Add Provider'))
  await pressDown(stdin)
  await focusItem(lastFrame, '+Add Provider')
  await pressEnterUntil(stdin, 'directory opened', () => {
    const frame = lastFrame() ?? ''
    return frame.includes('amazon-bedrock') && !frame.includes('+Add DeepSeek')
  })
  await focusItem(lastFrame, 'amazon-bedrock')
}

describe('ModelsDialog add-provider windows', () => {
  it('opens the official provider directory from the middle add row', async () => {
    const api = fakeApi()
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await openDirectory(lastFrame, stdin)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Add Provider')
    expect(frame).toContain('anthropic')
    expect(frame).toContain('minimax-cn')
    expect(frame).toContain('zai-coding-cn')
    expect(frame).not.toContain('+Add DeepSeek')
    expect(api.listProviderDirectory).toHaveBeenCalledTimes(1)
  })

  it('moves to the api key window on enter and fetches models on submit', async () => {
    const api = fakeApi()
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await openDirectory(lastFrame, stdin)
    await pressEnterUntil(stdin, 'key window shows submit', frameIncludes(lastFrame, 'Submit'))
    expect(lastFrame() ?? '').toContain('Add amazon-bedrock')
    await pressDown(stdin)
    await focusItem(lastFrame, 'Submit')
    await pressEnter(stdin)
    await until('models fetched', () => api.fetchProviderModels.mock.calls.length > 0)
    expect(api.fetchProviderModels).toHaveBeenCalledWith(DIRECTORY[0], '')
    await until('select models window', frameIncludes(lastFrame, 'Model One'))
    expect(lastFrame() ?? '').toContain('Select Models')
  })

  it('saves picked models through saveBuiltinProvider', async () => {
    const api = fakeApi()
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await openDirectory(lastFrame, stdin)
    await pressEnterUntil(stdin, 'key window shows submit', frameIncludes(lastFrame, 'Submit'))
    await pressDown(stdin)
    await focusItem(lastFrame, 'Submit')
    await pressEnter(stdin)
    await until('models fetched', () => api.fetchProviderModels.mock.calls.length > 0)
    await until('select models window', frameIncludes(lastFrame, 'Model One'))
    await pressKeyUntil(' ', stdin, 'model checked', frameIncludes(lastFrame, '\u2713'))
    await pressEnterUntil(stdin, 'provider saved', () => api.saveBuiltinProvider.mock.calls.length > 0)
    expect(api.saveBuiltinProvider).toHaveBeenCalledWith(DIRECTORY[0], '', DISCOVERED)
    await until('back to model list', frameIncludes(lastFrame, '+Add DeepSeek'))
  })

  it('rejects an invalid custom provider id before fetching models', async () => {
    const api = fakeApi()
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await until('main list shows add rows', frameIncludes(lastFrame, '+Add Custom Provider'))
    await pressDown(stdin)
    await pressDown(stdin)
    await focusItem(lastFrame, '+Add Custom Provider')
    await pressEnterUntil(stdin, 'custom form opens', frameIncludes(lastFrame, 'Provider ID'))
    for (let i = 0; i < 6 && !focusedSegment(lastFrame() ?? '').includes('Submit'); i++) {
      await pressDown(stdin)
    }
    await focusItem(lastFrame, 'Submit')
    await pressEnterUntil(stdin, 'inline validation error', frameIncludes(lastFrame, 'Provider ID must start with a letter'))
    expect(api.fetchCustomModels).not.toHaveBeenCalled()
    expect(api.saveCustomProvider).not.toHaveBeenCalled()
  })
})

describe('ModelsDialog grouped list and model management', () => {
  const MODELS: ConfiguredModel[] = [
    { id: 'ox-alpha', name: 'Ox Alpha', provider: 'or', providerName: 'or' },
    { id: 'big-pickle', name: 'big-pickle', provider: 'opencodeZen', providerName: 'opencodeZen' },
  ]

  it('renders section headers with models above providers and omits an empty models group', async () => {
    const api = { ...fakeApi(), listModels: vi.fn(async () => MODELS) }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await until('headers visible', () => {
      const frame = lastFrame() ?? ''
      return frame.includes('Models') && frame.includes('Providers') && frame.includes('Ox Alpha')
    })
    const lines = (lastFrame() ?? '').split('\n').map(line => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
    const modelsHeader = lines.indexOf('Models')
    const providersHeader = lines.indexOf('Providers')
    const oxAlpha = lines.findIndex(line => line.includes('Ox Alpha'))
    const addRow = lines.findIndex(line => line.includes('+Add DeepSeek'))
    expect(modelsHeader).toBeGreaterThanOrEqual(0)
    expect(oxAlpha).toBeGreaterThan(modelsHeader)
    expect(providersHeader).toBeGreaterThan(oxAlpha)
    expect(addRow).toBeGreaterThan(providersHeader)

    const emptyApi = fakeApi()
    const empty = render(
      <Box width={100} height={24}>
        <ModelsDialog api={emptyApi} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await until('empty list ready', frameIncludes(empty.lastFrame, '+Add DeepSeek'))
    await until('empty list settled', () => !(empty.lastFrame() ?? '').includes('loading'))
    expect(empty.lastFrame() ?? '').not.toContain('Models\n')
    const emptyLines = (empty.lastFrame() ?? '').split('\n').map(line => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
    expect(emptyLines).not.toContain('Models')
    expect(emptyLines).toContain('Providers')
  })

  it('deletes a model with a two-stage Ctrl+D and keeps other models', async () => {
    const api = { ...fakeApi(), listModels: vi.fn(async () => MODELS) }
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await pressDownUntil(stdin, lastFrame, 'Ox Alpha')
    await focusItem(lastFrame, 'Ox Alpha')
    await pressKeyUntil('\u0004', stdin, 'delete armed', frameIncludes(lastFrame, 'Press Ctrl+D again'))
    await pressKeyUntil('\u0004', stdin, 'delete executed', () => api.deleteModelEntry.mock.calls.length > 0)
    expect(api.deleteModelEntry).toHaveBeenCalledWith('llm-pi-ai', 'or', 'ox-alpha')
  })

  it('opens the configure window on Ctrl+E prefilled from stored settings and saves on submit', async () => {
    const api = {
      ...fakeApi(),
      listModels: vi.fn(async () => MODELS),
      readModelEntries: vi.fn((_ns: string, provider: string) =>
        provider === 'opencodeZen'
          ? [{ id: 'big-pickle', contextWindow: 131072, maxTokens: 8192, reasoningEfforts: { off: null, high: 'high' } }]
          : []),
    }
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
      </Box>,
    )
    await pressDownUntil(stdin, lastFrame, 'Ox Alpha')
    await pressDown(stdin)
    await focusItem(lastFrame, 'big-pickle')
    await pressKeyUntil('\u0005', stdin, 'configure window open', frameIncludes(lastFrame, 'Configure Model'))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('131072')
    expect(frame).toContain('8192')
    expect(frame).toContain('high')
    expect(api.readModelEntries).toHaveBeenCalledWith('llm-pi-ai', 'opencodeZen')
    for (let i = 0; i < 20 && !focusedSegment(lastFrame() ?? '').includes('Submit'); i++) {
      await pressDown(stdin)
    }
    await focusItem(lastFrame, 'Submit')
    await pressEnterUntil(stdin, 'model saved', () => api.saveModelEntry.mock.calls.length > 0)
    expect(api.saveModelEntry).toHaveBeenCalledWith('llm-pi-ai', 'opencodeZen', {
      id: 'big-pickle',
      contextWindow: 131072,
      maxTokens: 8192,
      reasoningEfforts: { off: null, high: 'high' },
    })
  })
})
