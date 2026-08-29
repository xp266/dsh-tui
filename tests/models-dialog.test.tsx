import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { ModelsDialog } from '../src/ui/dialog/models-dialog.tsx'
import type { ConfiguredModel } from '../src/chat/models.ts'

const DISCOVERED: LlmDiscoveredModel[] = [{ id: 'm1', name: 'Model One' }]

function fakeApi() {
  return {
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
    listProviderDirectory: vi.fn(async () => []),
    fetchProviderModels: vi.fn(async () => DISCOVERED),
    saveProviderKey: vi.fn(async () => {}),
    saveProviderModels: vi.fn(async () => {}),
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

async function pressDown(stdin: { write(data: string): void }): Promise<void> {
  act(() => {
    stdin.write('\u001b[B')
  })
  await new Promise(resolve => setTimeout(resolve, 25))
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

describe('ModelsDialog model list', () => {
  const MODELS: ConfiguredModel[] = [
    { id: 'ox-alpha', name: 'Ox Alpha', provider: 'or', providerName: 'or' },
    { id: 'big-pickle', name: 'big-pickle', provider: 'opencodeZen', providerName: 'opencodeZen' },
  ]

  it('lists models with their provider on the right and no add rows or group headers', async () => {
    const api = { ...fakeApi(), listModels: vi.fn(async () => MODELS) }
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} onAddProvider={() => {}} />
      </Box>,
    )
    await until('models visible', frameIncludes(lastFrame, 'Ox Alpha'))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Ox Alpha')
    expect(frame).toContain('big-pickle')
    expect(frame).toContain('opencodeZen')
    expect(frame).toContain('Ctrl+A add providers · Ctrl+E configure')
    expect(frame).not.toContain('+Add')
    const lines = frame.split('\n').map(line => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
    expect(lines).not.toContain('Models')
    expect(lines).not.toContain('Providers')
  })

  it('enters the empty model list without group headers or add rows', async () => {
    const api = fakeApi()
    const { lastFrame } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} onAddProvider={() => {}} />
      </Box>,
    )
    await until('empty list settled', () => !(lastFrame() ?? '').includes('loading'))
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('+Add')
    const lines = frame.split('\n').map(line => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
    expect(lines).not.toContain('Models')
    expect(lines).not.toContain('Providers')
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
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} onAddProvider={() => {}} />
      </Box>,
    )
    await pressDownUntil(stdin, lastFrame, 'Ox Alpha')
    await pressDownUntil(stdin, lastFrame, 'big-pickle')
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
    await pressKeyUntil('\r', stdin, 'model saved', () => api.saveModelEntry.mock.calls.length > 0)
    expect(api.saveModelEntry).toHaveBeenCalledWith('llm-pi-ai', 'opencodeZen', {
      id: 'big-pickle',
      contextWindow: 131072,
      maxTokens: 8192,
      reasoningEfforts: { off: null, high: 'high' },
    })
  })

  it('opens the providers window through Ctrl+A', async () => {
    const api = { ...fakeApi(), listModels: vi.fn(async () => MODELS) }
    const onAddProvider = vi.fn()
    const { lastFrame, stdin } = render(
      <Box width={100} height={24}>
        <ModelsDialog api={api} onClose={() => {}} onModelSelected={() => {}} onAddProvider={onAddProvider} />
      </Box>,
    )
    await pressDownUntil(stdin, lastFrame, 'Ox Alpha')
    await pressKeyUntil('\u0001', stdin, 'providers requested', () => onAddProvider.mock.calls.length > 0)
    expect(onAddProvider).toHaveBeenCalledTimes(1)
  })
})