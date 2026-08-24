import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { InteractionStore } from '../src/chat/interactions.ts'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'

function fakeBridge(): ChatBridge {
  return {
    modelName: () => 'glm-4.7-flash',
    send: vi.fn(),
    interrupt: vi.fn(),
    subscribe: () => () => {},
    listSessions: vi.fn(async () => []),
    openSession: vi.fn(async () => {}),
    newSession: vi.fn(async () => {}),
    archiveSession: vi.fn(async () => {}),
    activeSessionId: () => '',
    listModels: vi.fn(async () => []),
    selectModel: vi.fn(async () => {}),
    addDeepSeekKey: vi.fn(async () => {}),
    fetchCustomModels: vi.fn(async () => []),
    saveCustomProvider: vi.fn(async () => {}),
    listProviderDirectory: vi.fn(async () => []),
    fetchProviderModels: vi.fn(async () => []),
    saveBuiltinProvider: vi.fn(async () => {}),
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
    interactions: new InteractionStore(),
  }
}

function focusedSegment(frame: string): string {
  const match = frame.match(/\x1b\[7m((?:\x1b\[[0-9;]*[A-Za-z])*[^\x1b]*)/)
  return (match?.[1] ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
}

async function type(stdin: { write(data: string): void }, data: string) {
  act(() => {
    stdin.write(data)
  })
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('command availability', () => {
  it('hides unavailable /todo and never lets the pointer reach a ghost entry', async () => {
    const bridge = fakeBridge()
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await type(stdin, '/')
    let frame = lastFrame() ?? ''
    expect(frame).toContain('/new')
    expect(frame).not.toContain('/todo')

    await type(stdin, '\u001b[B')
    frame = lastFrame() ?? ''
    expect(focusedSegment(frame)).not.toContain('/todo')

    await type(stdin, '\u001b[A')
    await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(focusedSegment(frame)).toContain('/new')

    await type(stdin, '\r')
    await type(stdin, '\r')
    expect(bridge.newSession).toHaveBeenCalled()
    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('swallows an explicitly typed unavailable command instead of sending it to the model', async () => {
    const bridge = fakeBridge()
    const { stdin } = render(<App bridge={bridge} />)
    await type(stdin, '/todo')
    await type(stdin, '\r')
    expect(bridge.send).not.toHaveBeenCalled()
    expect(bridge.newSession).not.toHaveBeenCalled()
  })

  it('keeps /todo reachable once todos exist', async () => {
    const bridge = fakeBridge()
    let handler: ((event: unknown) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb as typeof handler
      return () => {}
    }
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await new Promise(resolve => setTimeout(resolve, 30))
    act(() => {
      handler?.({
        type: 'todo/write',
        seq: 1,
        time: 0,
        data: { todos: [{ content: 'first task', status: 'pending' }] },
      })
    })
    await new Promise(resolve => setTimeout(resolve, 60))
    await type(stdin, '/')
    const frame = lastFrame() ?? ''
    expect(frame).toContain('/todo')
  })

  it('merges host registry commands into hints and executes them on send', async () => {
    const bridge = fakeBridge() as ChatBridge & {
      listRegistryCommands(): unknown[]
      onRegistryChanged(listener: () => void): () => void
      executeCommandLine: ReturnType<typeof vi.fn>
    }
    const executed = vi.fn(async () => {})
    let changeListener: (() => void) | undefined
    bridge.executeCommandLine = executed
    bridge.listRegistryCommands = () => [{ name: 'echo', description: 'Echo test command' }]
    bridge.onRegistryChanged = listener => {
      changeListener = listener
      return () => {}
    }
    const { lastFrame, stdin } = render(<App bridge={bridge} />)
    await type(stdin, '/')
    expect(lastFrame() ?? '').toContain('/echo')
    expect(lastFrame() ?? '').toContain('Echo test command')

    act(() => {
      changeListener?.()
    })
    await type(stdin, '\u001b[B')
    await type(stdin, '\u001b[B')
    let frame = lastFrame() ?? ''
    while (!focusedSegment(frame).includes('/echo')) {
      await type(stdin, '\u001b[B')
      const next = lastFrame() ?? ''
      if (next === frame) break
      frame = next
    }
    expect(focusedSegment(frame)).toContain('/echo')

    await type(stdin, '\r')
    await type(stdin, '\r')
    expect(executed).toHaveBeenCalledWith('/echo')
    expect(bridge.send).not.toHaveBeenCalled()
  })
})
