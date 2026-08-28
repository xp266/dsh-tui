import { act } from 'react'
import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import { ProvidersDialog } from '../src/ui/dialog/providers-dialog.tsx'
import type { OfficialProvider } from '../src/chat/models.ts'

const DIRECTORY: OfficialProvider[] = [
  { provider: 'deepseek', displayName: 'DeepSeek', settingsNs: 'llm-deepseek' },
  { provider: 'amazon-bedrock', displayName: 'amazon-bedrock', settingsNs: 'llm-pi-ai', declared: false },
  { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', declared: false },
  { provider: 'acme-gateway', displayName: 'Acme Gateway', settingsNs: 'llm-pi-ai', declared: true },
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
  attempts = 12,
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

function renderDialog() {
  const api = fakeApi()
  const view = render(
    <Box width={100} height={24}>
      <ProvidersDialog api={api} onClose={() => {}} onModelSelected={() => {}} />
    </Box>,
  )
  return { api, view, lastFrame: view.lastFrame, stdin: view.stdin }
}

function linesOf(frame: string): string[] {
  return frame.split('\n').map(line => line.replace(/\x1b\[[0-9;]*m/g, '').trim())
}

describe('ProvidersDialog provider list', () => {
  it('renders providers left-aligned with their source right-aligned and no add rows', async () => {
    const { view, lastFrame } = renderDialog()
    await until('providers loaded', frameIncludes(lastFrame, 'third-party plugin'))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('DeepSeek')
    expect(frame).toContain('deepseek official')
    expect(frame).toContain('amazon-bedrock')
    expect(frame).toContain('official plugin')
    expect(frame).toContain('Acme Gateway')
    expect(frame).toContain('third-party plugin')
    expect(frame).toContain('Custom Provider')
    expect(frame).toContain('custom')
    expect(frame).not.toContain('+Add')
    view.unmount()
  })

  it('dedupes the deepseek directory route into the single official entry', async () => {
    const { view, lastFrame } = renderDialog()
    await until('providers loaded', frameIncludes(lastFrame, 'third-party plugin'))
    const lines = linesOf(lastFrame() ?? '').filter(line => line.includes('deepseek official'))
    expect(lines.length).toBe(1)
    view.unmount()
  })

  it('opens the DeepSeek key window on enter and stores the passed key', async () => {
    const { api, view, lastFrame, stdin } = renderDialog()
    await until('providers loaded', frameIncludes(lastFrame, 'Custom Provider'))
    await focusItem(lastFrame, 'DeepSeek')
    await pressKeyUntil('\r', stdin, 'deepseek key window', frameIncludes(lastFrame, 'Add DeepSeek'))
    expect(lastFrame() ?? '').toContain('Submit')
    for (const ch of 'sk-test-123') {
      act(() => {
        stdin.write(ch)
      })
    }
    await pressDown(stdin)
    await focusItem(lastFrame, 'Submit')
    await pressKeyUntil('\r', stdin, 'key stored', () => api.addDeepSeekKey.mock.calls.length > 0)
    expect(api.addDeepSeekKey).toHaveBeenCalledWith('sk-test-123')
    view.unmount()
  })

  it('moves to the api key window for a directory provider and fetches models on submit', async () => {
    const { api, view, lastFrame, stdin } = renderDialog()
    await until('providers loaded', frameIncludes(lastFrame, 'Custom Provider'))
    await pressDownUntil(stdin, lastFrame, 'amazon-bedrock')
    await pressKeyUntil('\r', stdin, 'key window shows submit', frameIncludes(lastFrame, 'Submit'))
    expect(lastFrame() ?? '').toContain('Add amazon-bedrock')
    await pressDown(stdin)
    await focusItem(lastFrame, 'Submit')
    await pressKeyUntil('\r', stdin, 'models fetched', () => api.fetchProviderModels.mock.calls.length > 0)
    const entry = DIRECTORY.find(candidate => candidate.provider === 'amazon-bedrock')
    expect(api.fetchProviderModels).toHaveBeenCalledWith(entry, '')
    await until('select models window', frameIncludes(lastFrame, 'Model One'))
    expect(lastFrame() ?? '').toContain('Select Models')
    view.unmount()
  })

  it('saves picked models through saveBuiltinProvider', async () => {
    const { api, view, lastFrame, stdin } = renderDialog()
    await until('providers loaded', frameIncludes(lastFrame, 'Custom Provider'))
    await pressDownUntil(stdin, lastFrame, 'amazon-bedrock')
    await pressKeyUntil('\r', stdin, 'key window shows submit', frameIncludes(lastFrame, 'Submit'))
    await pressDown(stdin)
    await focusItem(lastFrame, 'Submit')
    await pressKeyUntil('\r', stdin, 'models fetched', () => api.fetchProviderModels.mock.calls.length > 0)
    await until('select models window', frameIncludes(lastFrame, 'Model One'))
    act(() => {
      stdin.write(' ')
    })
    await until('model checked', frameIncludes(lastFrame, '\u2713'))
    await pressKeyUntil('\r', stdin, 'provider saved', () => api.saveBuiltinProvider.mock.calls.length > 0)
    const entry = DIRECTORY.find(candidate => candidate.provider === 'amazon-bedrock')
    expect(api.saveBuiltinProvider).toHaveBeenCalledWith(entry, '', DISCOVERED)
    view.unmount()
  })

  it('rejects an invalid custom provider id before fetching models', async () => {
    const { api, view, lastFrame, stdin } = renderDialog()
    await until('providers loaded', frameIncludes(lastFrame, 'Custom Provider'))
    await pressDownUntil(stdin, lastFrame, 'Custom Provider')
    await pressKeyUntil('\r', stdin, 'custom form opens', frameIncludes(lastFrame, 'Provider ID'))
    for (const ch of '1bad') {
      act(() => {
        stdin.write(ch)
      })
    }
    for (let i = 0; i < 6 && !focusedSegment(lastFrame() ?? '').includes('Submit'); i++) {
      await pressDown(stdin)
    }
    await focusItem(lastFrame, 'Submit')
    await pressKeyUntil('\r', stdin, 'inline validation error', frameIncludes(lastFrame, 'Provider ID must start with a letter'))
    expect(api.fetchCustomModels).not.toHaveBeenCalled()
    expect(api.saveCustomProvider).not.toHaveBeenCalled()
    view.unmount()
  })
})