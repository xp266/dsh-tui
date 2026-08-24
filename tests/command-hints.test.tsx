import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { InteractionStore } from '../src/chat/interactions.ts'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { App } from '../src/ui/app.tsx'

vi.mock('../src/ui/input/commands.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/ui/input/commands.ts')>()
  const commands = Array.from({ length: 9 }, (_, i) => ({ command: `/c${i + 1}`, description: `d${i + 1}` }))
  const filterCommands = (value: string) => {
    const token = value.split(/\s+/, 1)[0] ?? ''
    if (!token.startsWith('/')) return []
    return commands.filter(command => command.command.startsWith(token))
  }
  return {
    ...actual,
    COMMANDS: commands,
    filterCommands,
    visibleCommands: (value: string, isAvailable?: (command: (typeof commands)[number]) => boolean) => {
      const matches = filterCommands(value)
      return isAvailable === undefined ? matches : matches.filter(isAvailable)
    },
    matchCommand: (text: string) => commands.find(command => command.command === text),
    matchAvailableCommand: (text: string, isAvailable?: (command: (typeof commands)[number]) => boolean) => {
      const command = commands.find(entry => entry.command === text)
      if (command === undefined) return undefined
      if (isAvailable !== undefined && !isAvailable(command)) return undefined
      return command
    },
  }
})

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

describe('command hint windowing', () => {
  it('caps visible hints and scrolls the window with the pointer', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await type(stdin, '/')
    let frame = lastFrame() ?? ''
    expect(frame).toContain('/c1')
    expect(frame).toContain('/c7')
    expect(frame).not.toContain('/c8')
    expect(focusedSegment(frame)).toContain('/c1')

    for (let i = 0; i < 7; i++) await type(stdin, '\u001b[B')
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('/c1')
    expect(frame).toContain('/c8')
    expect(focusedSegment(frame)).toContain('/c8')

    await type(stdin, '\u001b[B')
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('/c1')
    expect(frame).toContain('/c9')
    expect(focusedSegment(frame)).toContain('/c9')

    for (let i = 0; i < 8; i++) await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(frame).toContain('/c1')
    expect(frame).not.toContain('/c8')
    expect(focusedSegment(frame)).toContain('/c1')
  })

  it('keeps the window still until the pointer leaves its bounds', async () => {
    const { lastFrame, stdin } = render(<App bridge={fakeBridge()} />)
    await type(stdin, '/')
    for (let i = 0; i < 7; i++) await type(stdin, '\u001b[B')
    let frame = lastFrame() ?? ''
    expect(frame).not.toContain('/c1')
    expect(focusedSegment(frame)).toContain('/c8')

    await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('/c1')
    expect(frame).toContain('/c2')
    expect(focusedSegment(frame)).toContain('/c7')

    for (let i = 0; i < 6; i++) await type(stdin, '\u001b[A')
    frame = lastFrame() ?? ''
    expect(frame).toContain('/c1')
    expect(focusedSegment(frame)).toContain('/c1')
  })
})
