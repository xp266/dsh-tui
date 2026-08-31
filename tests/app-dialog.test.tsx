import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'
import { createFakeBridge } from './helpers/fake-bridge.ts'

function fakeBridge(): ChatBridge {
  return createFakeBridge()
}

function flatten(frame: string): string {
  return frame.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\s+/g, ' ')
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
}

async function sendCommand(stdin: { write(data: string): void }, command: string): Promise<void> {
  act(() => {
    stdin.write(command)
  })
  await settle()
  act(() => {
    stdin.write('\r')
  })
  await settle()
}

async function openModelsDialog(stdin: { write(data: string): void }): Promise<void> {
  await sendCommand(stdin, '/models')
}

async function openProvidersDialog(stdin: { write(data: string): void }): Promise<void> {
  await sendCommand(stdin, '/providers')
}

async function openAddCustomForm(stdin: { write(data: string): void }): Promise<void> {
  await openProvidersDialog(stdin)
  act(() => {
    stdin.write('\u001b[B')
  })
  act(() => {
    stdin.write('\r')
  })
  await settle()
}

describe('App dialog keyboard', () => {
  it('shows the models window with the providers hint and no add rows', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openModelsDialog(stdin)
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('models')
    expect(flatten(frame)).toContain('Ctrl+A add providers · Ctrl+E configure')
    expect(frame).not.toContain('+Add')
  })

  it('opens the providers window when /providers is sent', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openProvidersDialog(stdin)
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('providers')
    expect(frame).toContain('Custom Provider')
  })

  it('opens the providers window from the models window with Ctrl+A', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openModelsDialog(stdin)
    act(() => {
      stdin.write('\u0001')
    })
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('providers')
    expect(frame).toContain('Custom Provider')
  })

  it('shows fetching feedback while discovering custom models and ignores repeated enter', async () => {
    const bridge = fakeBridge()
    let resolveFetch: ((models: LlmDiscoveredModel[]) => void) | undefined
    bridge.fetchCustomModels = vi.fn(
      () =>
        new Promise<LlmDiscoveredModel[]>(resolve => {
          resolveFetch = resolve
        }),
    )
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await openAddCustomForm(stdin)
    expect(lastFrame() ?? '').toContain('Provider ID')
    for (const ch of 'acme') {
      act(() => {
        stdin.write(ch)
      })
    }
    for (let i = 0; i < 5; i++) {
      act(() => {
        stdin.write('\u001b[B')
      })
    }
    await settle()
    act(() => {
      stdin.write('\r')
    })
    await settle()
    expect(lastFrame() ?? '').toContain('Fetching models...')
    expect(bridge.fetchCustomModels).toHaveBeenCalledTimes(1)
    act(() => {
      stdin.write('\r')
    })
    await settle()
    expect(bridge.fetchCustomModels).toHaveBeenCalledTimes(1)
    act(() => {
      resolveFetch?.([{ id: 'm1', name: 'Model One' } as LlmDiscoveredModel])
    })
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Select Models')
    expect(frame).toContain('Model One')
    expect(frame).not.toContain('Fetching models...')
  })

  it('reports fetch errors in the footer after the fetching hint clears', async () => {
    const bridge = fakeBridge()
    let rejectFetch: ((cause: Error) => void) | undefined
    bridge.fetchCustomModels = vi.fn(
      () =>
        new Promise<LlmDiscoveredModel[]>((_resolve, reject) => {
          rejectFetch = reject
        }),
    )
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await openAddCustomForm(stdin)
    for (const ch of 'acme') {
      act(() => {
        stdin.write(ch)
      })
    }
    for (let i = 0; i < 5; i++) {
      act(() => {
        stdin.write('\u001b[B')
      })
    }
    await settle()
    act(() => {
      stdin.write('\r')
    })
    await settle()
    act(() => {
      rejectFetch?.(new Error('network unreachable'))
    })
    await settle()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('network unreachable')
    expect(frame).not.toContain('Fetching models...')
  })

  it('separates the protocol carousel and the submit row with a blank line', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openAddCustomForm(stdin)
    for (let i = 0; i < 5; i++) {
      act(() => {
        stdin.write('\u001b[B')
      })
      await settle()
    }
    const lines = (lastFrame() ?? '').split('\n')
    const carousel = lines.findIndex(line => line.includes('API Protocol:'))
    const submit = lines.findIndex(line => line.includes('Submit'))
    expect(carousel).toBeGreaterThanOrEqual(0)
    expect(submit).toBe(carousel + 2)
  })
})