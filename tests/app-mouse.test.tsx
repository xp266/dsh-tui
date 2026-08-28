import { act } from 'react'
import { render } from 'ink-testing-library'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
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
    readModelEntries: () => [],
    saveModelEntry: vi.fn(async () => {}),
    deleteModelEntry: vi.fn(async () => {}),
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

let fakeStdin: EventEmitter
let originalDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  fakeStdin = new EventEmitter()
  const anyFake = fakeStdin as EventEmitter & { isRaw: boolean; setRawMode: () => void; resume: () => void; pause: () => void }
  anyFake.isRaw = false
  anyFake.setRawMode = () => {}
  anyFake.resume = () => {}
  anyFake.pause = () => {}
  originalDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true, writable: true })
})

afterEach(() => {
  if (originalDescriptor !== undefined) {
    Object.defineProperty(process, 'stdin', originalDescriptor)
  }
  vi.restoreAllMocks()
})

async function flush(ms = 0): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

describe('app mouse routing', () => {
  it('places the input cursor on click and inserts at that spot', async () => {
    const view = render(<App bridge={fakeBridge()} />)
    await flush()
    act(() => {
      view.stdin.write('hello world')
    })
    await flush()
    act(() => {
      fakeStdin.emit('data', Buffer.from('\x1b[<0;10;20M', 'latin1'))
      fakeStdin.emit('data', Buffer.from('\x1b[<0;10;20m', 'latin1'))
    })
    await flush()
    act(() => {
      view.stdin.write('X')
    })
    await flush()
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('helloX world')
  })

  it('selects composer text with a drag from the input area', async () => {
    const view = render(<App bridge={fakeBridge()} />)
    await flush()
    act(() => {
      view.stdin.write('hello world')
    })
    await flush()
    act(() => {
      fakeStdin.emit('data', Buffer.from('\x1b[<0;10;20M', 'latin1'))
      fakeStdin.emit('data', Buffer.from('\x1b[<32;15;20M', 'latin1'))
      fakeStdin.emit('data', Buffer.from('\x1b[<0;15;20m', 'latin1'))
    })
    await flush()
    expect(view.lastFrame() ?? '').toMatch(/\x1b\[48;5;\d+m/)
  })

  it('selects approval body text with a drag over the panel', async () => {
    const interactions = new InteractionStore()
    const view = render(<App bridge={fakeBridgeWith(interactions)} />)
    await flush()
    void interactions.pushApproval('bash', undefined, 'needs network access for the install step')
    await flush()
    act(() => {
      const row = frameRow(view.lastFrame() ?? '', 'needs network')
      fakeStdin.emit('data', Buffer.from(`\x1b[<0;8;${row + 1}M`, 'latin1'))
      fakeStdin.emit('data', Buffer.from(`\x1b[<32;30;${row + 1}M`, 'latin1'))
      fakeStdin.emit('data', Buffer.from(`\x1b[<0;30;${row + 1}m`, 'latin1'))
    })
    await flush()
    expect(view.lastFrame() ?? '').toMatch(/\x1b\[48;5;\d+m[^\n]*network/)
  })

  it('clicks the approval reject button through the panel handle', async () => {
    const interactions = new InteractionStore()
    const view = render(<App bridge={fakeBridgeWith(interactions)} />)
    await flush()
    const pending = interactions.pushApproval('bash', undefined, 'needs network access')
    await flush()
    const frame = view.lastFrame() ?? ''
    const buttonRow = stripAnsi(frame).split('\n').findIndex(line => line.includes('Allow once'))
    expect(buttonRow).toBeGreaterThan(0)
    const rejectCol = stripAnsi(frame).split('\n')[buttonRow]!.indexOf('Reject')
    act(() => {
      fakeStdin.emit('data', Buffer.from(`\x1b[<0;${rejectCol + 1};${buttonRow + 1}M`, 'latin1'))
      fakeStdin.emit('data', Buffer.from(`\x1b[<0;${rejectCol + 1};${buttonRow + 1}m`, 'latin1'))
    })
    await flush()
    await expect(pending).resolves.toBe('rejected')
  })

  it('focuses and toggles a question option by clicking its row', async () => {
    const interactions = new InteractionStore()
    const view = render(<App bridge={fakeBridgeWith(interactions)} />)
    await flush()
    void interactions.pushQuestion({
      questions: [{ id: 'q1', question: 'Proceed with install?', options: [{ label: 'Yes' }, { label: 'No' }] }],
    })
    await flush()
    const clickAt = (row: number) => {
      act(() => {
        fakeStdin.emit('data', Buffer.from(`\x1b[<0;10;${row + 1}M`, 'latin1'))
        fakeStdin.emit('data', Buffer.from(`\x1b[<0;10;${row + 1}m`, 'latin1'))
      })
    }
    let frame = stripAnsi(view.lastFrame() ?? '')
    const optionLine = frame.split('\n').findIndex(line => line.includes('2. No'))
    expect(optionLine).toBeGreaterThan(0)
    clickAt(optionLine)
    await flush()
    frame = stripAnsi(view.lastFrame() ?? '')
    const focusedLine = frame.split('\n').find(line => line.includes('2. No'))
    expect(focusedLine).toContain('❯')
    clickAt(optionLine)
    await flush()
    frame = stripAnsi(view.lastFrame() ?? '')
    expect(frame.split('\n').find(line => line.includes('2. No'))).toMatch(/2\. No\s+✓/)
  })

  it('moves the command selection with the wheel over the hint window', async () => {
    const view = render(<App bridge={fakeBridge()} />)
    await flush()
    act(() => {
      view.stdin.write('/mod')
    })
    await flush()
    act(() => {
      fakeStdin.emit('data', Buffer.from('\x1b[<64;10;18M', 'latin1'))
    })
    await flush()
    act(() => {
      view.stdin.write('\r')
    })
    await flush()
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('/model-effort')
  })

  it('keeps chat text out of the input well when scrolling', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} />)
    await flush()
    act(() => {
      for (let i = 0; i < 40; i++) {
        handler?.({
          type: 'user/message',
          seq: i,
          time: 0,
          data: createUserMessage({ content: [{ type: 'text', text: `message number ${i} with filler text` }], source: { kind: 'user' } }),
        })
      }
    })
    await flush(80)
    act(() => {
      view.stdin.write('\x1b[5~')
    })
    await flush(80)
    act(() => {
      view.stdin.write('\x1b[6~')
    })
    await flush(80)
    const lines = stripAnsi(view.lastFrame() ?? '').split('\n')
    const well = lines.slice(19, 21).join('|')
    expect(well).not.toContain('message number')
  })
})

function fakeBridgeWith(interactions: InteractionStore): ChatBridge {
  const bridge = fakeBridge()
  bridge.interactions = interactions
  return bridge
}

function frameRow(frame: string, needle: string): number {
  return stripAnsi(frame).split('\n').findIndex(line => line.includes(needle))
}
