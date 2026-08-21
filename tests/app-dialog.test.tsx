import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'

function fakeBridge(): ChatBridge {
  return {
    modelName: () => 'glm-4.7-flash',
    send: vi.fn(),
    subscribe: () => () => {},
    listSessions: vi.fn(async () => []),
    openSession: vi.fn(async () => {}),
    newSession: vi.fn(async () => {}),
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    addDeepSeekKey: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
    cwd: () => process.cwd(),
    listPresets: vi.fn(async () => []),
    currentPreset: () => 'standard',
    presetName: () => 'Standard mode',
    selectPreset: vi.fn(async () => {}),
    listEfforts: vi.fn(async () => []),
    currentEffort: () => undefined,
    effortName: () => undefined,
    selectEffort: vi.fn(async () => {}),
    permissionMode: () => 'workspace-write',
    cyclePermission: vi.fn(),
    listPermissionPresets: vi.fn(async () => ['read-only', 'workspace-write', 'danger-full-access']),
    defaultPermission: () => 'workspace-write',
    setDefaultPermission: vi.fn(async () => {}),
    defaultPresetId: () => 'standard',
    setDefaultPreset: vi.fn(async () => {}),
    tokenStats: () => ({ input: 0, output: 0, hitPercent: 0, contextPercent: 0 }),
    toolPresenter: { call: () => undefined, result: () => undefined, argsJson: () => undefined },
  }
}

function focusedSegment(frame: string): string {
  return frame.match(/\x1b\[7m([^\x1b]*)/)?.[1] ?? ''
}

async function openModelsDialog(stdin: { write(data: string): void }) {
  act(() => {
    stdin.write('/models')
  })
  act(() => {
    stdin.write('\r')
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
    const after = lastFrame() ?? ''
    expect(focusedSegment(after)).toContain('+Add Custom Model')
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
    await openModelsDialog(stdin)
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    for (let i = 0; i < 3; i++) {
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
    await openModelsDialog(stdin)
    act(() => {
      stdin.write('\u001b[B')
    })
    act(() => {
      stdin.write('\r')
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    for (let i = 0; i < 3; i++) {
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
})