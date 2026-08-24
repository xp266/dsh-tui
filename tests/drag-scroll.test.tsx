import { act } from 'react'
import { render } from 'ink-testing-library'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import type { ScreenCapture } from '../src/terminal/screen.ts'
import { App } from '../src/ui/app.tsx'

function fakeScreen(): ScreenCapture {
  return {
    stream: process.stdout,
    extract: () => '',
    extractSelection: () => '',
    rowHasText: () => true,
  }
}

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
    interactions: undefined as never,
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

function mouse(code: number, x: number, y: number, press: boolean): string {
  return `\x1b[<${code};${x};${y}${press ? 'M' : 'm'}`
}

describe('drag follow scroll', () => {
  it('auto-scrolls upward while dragging on the top row and stops on release', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} screen={fakeScreen()} />)
    await flush()
    act(() => {
      for (let i = 0; i < 60; i++) {
        handler?.({
          type: 'user/message',
          seq: i,
          time: 0,
          data: createUserMessage({ content: [{ type: 'text', text: `marker-${i}-text` }], source: { kind: 'user' } }),
        } as SessionEvent)
      }
    })
    await flush(80)

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(64, 11, 3, true), 'latin1'))
    })
    await flush(80)
    const beforeFrame = stripAnsi(view.lastFrame() ?? '')
    const beforeMin = minMarker(beforeFrame)
    expect(beforeMin).toBeGreaterThan(0)

    const textRow = beforeFrame.split('\n').findIndex(line => line.includes('marker-'))
    expect(textRow).toBeGreaterThan(0)
    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 12, textRow + 1, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 12, 1, true), 'latin1'))
    })
    await flush(700)
    const duringFrame = stripAnsi(view.lastFrame() ?? '')
    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 12, 1, false), 'latin1'))
    })
    await flush(80)
    const afterRelease = stripAnsi(view.lastFrame() ?? '')

    const duringMin = minMarker(duringFrame)
    expect(duringMin).toBeLessThan(beforeMin!)
    await flush(400)
    const settled = stripAnsi(view.lastFrame() ?? '')
    expect(minMarker(settled)).toBe(duringMin)
    void afterRelease
  })

  it('does not auto-scroll when dragging through middle rows', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} screen={fakeScreen()} />)
    await flush()
    act(() => {
      for (let i = 0; i < 60; i++) {
        handler?.({
          type: 'user/message',
          seq: i,
          time: 0,
          data: createUserMessage({ content: [{ type: 'text', text: `marker-${i}-text` }], source: { kind: 'user' } }),
        } as SessionEvent)
      }
    })
    await flush(80)
    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(64, 11, 3, true), 'latin1'))
    })
    await flush(80)
    const frame = stripAnsi(view.lastFrame() ?? '')
    const textRow = frame.split('\n').findIndex(line => line.includes('marker-'))
    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 12, textRow + 1, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 12, 11, true), 'latin1'))
    })
    await flush(600)
    const afterDragMiddle = stripAnsi(view.lastFrame() ?? '')
    expect(minMarker(afterDragMiddle)).toBe(minMarker(frame))
  })

  it('scrolls via scrollbar track click and thumb drag', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} screen={fakeScreen()} />)
    await flush()
    act(() => {
      for (let i = 0; i < 60; i++) {
        handler?.({
          type: 'user/message',
          seq: i,
          time: 0,
          data: createUserMessage({ content: [{ type: 'text', text: `marker-${i}-text` }], source: { kind: 'user' } }),
        } as SessionEvent)
      }
    })
    await flush(80)

    for (let i = 0; i < 4; i++) {
      act(() => {
        view.stdin.write('\x1b[5~')
      })
      await flush(60)
    }
    const afterWheelMin = minMarker(stripAnsi(view.lastFrame() ?? ''))!
    expect(afterWheelMin).toBeGreaterThan(0)

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 98, 14, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(0, 98, 14, false), 'latin1'))
    })
    await flush(120)
    const trackClickMin = minMarker(stripAnsi(view.lastFrame() ?? ''))!
    expect(trackClickMin).toBeGreaterThan(afterWheelMin)

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 98, 14, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 98, 9, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 98, 2, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(0, 98, 2, false), 'latin1'))
    })
    await flush(120)
    const afterThumbDrag = stripAnsi(view.lastFrame() ?? '')
    expect(minMarker(afterThumbDrag)!).toBeLessThan(trackClickMin - 10)
  })
})

function minMarker(frame: string): number | undefined {
  let min: number | undefined
  for (const match of frame.matchAll(/marker-(\d+)-text/g)) {
    const value = Number(match[1])
    if (min === undefined || value < min) min = value
  }
  return min
}
