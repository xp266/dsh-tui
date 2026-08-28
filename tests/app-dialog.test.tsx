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

function focusedSegment(frame: string): string {
  return frame.match(/\x1b\[7m([^\x1b]*)/)?.[1] ?? ''
}

async function openModelsDialog(stdin: { write(data: string): void }) {
  act(() => {
    stdin.write('/models')
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  act(() => {
    stdin.write('\r')
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  act(() => {
    stdin.write('\r')
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

async function openAddCustomForm(stdin: { write(data: string): void }) {
  await openModelsDialog(stdin)
  act(() => {
    stdin.write('\u001b[B')
  })
  act(() => {
    stdin.write('\u001b[B')
  })
  act(() => {
    stdin.write('\r')
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('App dialog keyboard', () => {
  it('navigates the models dialog with arrow keys', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openModelsDialog(stdin)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Add DeepSeek')
    expect(focusedSegment(frame)).toContain('+Add DeepSeek')
    act(() => {
      stdin.write('\u001b[B')
    })
    const middle = lastFrame() ?? ''
    expect(focusedSegment(middle)).toContain('+Add Provider')
    act(() => {
      stdin.write('\u001b[B')
    })
    const after = lastFrame() ?? ''
    expect(focusedSegment(after)).toContain('+Add Custom Provider')
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
    expect(lastFrame() ?? '').toContain('Submit')
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
    await new Promise(resolve => setTimeout(resolve, 20))
    act(() => {
      stdin.write('\r')
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(lastFrame() ?? '').toContain('Fetching models...')
    expect(bridge.fetchCustomModels).toHaveBeenCalledTimes(1)
    act(() => {
      stdin.write('\r')
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(bridge.fetchCustomModels).toHaveBeenCalledTimes(1)
    act(() => {
      resolveFetch?.([{ id: 'm1', name: 'Model One' } as LlmDiscoveredModel])
    })
    await new Promise(resolve => setTimeout(resolve, 20))
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
    await new Promise(resolve => setTimeout(resolve, 20))
    act(() => {
      stdin.write('\r')
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    act(() => {
      rejectFetch?.(new Error('network unreachable'))
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    const frame = lastFrame() ?? ''
    expect(frame).toContain('network unreachable')
    expect(frame).not.toContain('Fetching models...')
  })

  it('separates the protocol carousel and the submit row with a blank line', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await openAddCustomForm(stdin)
    const lines = (lastFrame() ?? '').split('\n')
    const carousel = lines.findIndex(line => line.includes('API Protocol:'))
    const submit = lines.findIndex(line => line.includes('Submit'))
    expect(carousel).toBeGreaterThanOrEqual(0)
    expect(submit).toBe(carousel + 2)
  })
})