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
    })
    await flush()
    act(() => {
      view.stdin.write('X')
    })
    await flush()
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('helloX world')
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
