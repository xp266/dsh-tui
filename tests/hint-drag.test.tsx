import { act } from 'react'
import { render } from 'ink-testing-library'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { InteractionStore } from '../src/chat/interactions.ts'
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
  } as unknown as ChatBridge
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

async function flush(ms = 40): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

function mouse(code: number, x: number, y: number, press: boolean): string {
  return `\x1b[<${code};${x};${y}${press ? 'M' : 'm'}`
}

function focusedSegment(frame: string): string {
  const match = frame.match(/\x1b\[7m((?:\x1b\[[0-9;]*[A-Za-z])*[^\x1b]*)/)
  return (match?.[1] ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()
}

function selectionSpan(line: string): { text: string; startCol: number } {
  let col = 0
  let inSelection = false
  let text = ''
  let startCol = -1
  const codes = line.match(/\x1b\[[0-9;]*[A-Za-z]/g) ?? []
  const parts = line.split(/\x1b\[[0-9;]*[A-Za-z]/)
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const code = codes[i - 1]
      if (code === '\x1b[48;5;103m') inSelection = true
      else if (code.startsWith('\x1b[48;') || code === '\x1b[49m' || code === '\x1b[0m') inSelection = false
    }
    for (const ch of parts[i]) {
      if (inSelection) {
        if (startCol === -1) startCol = col
        text += ch
      }
      col += 1
    }
  }
  return { text, startCol }
}

async function openHints(view: { stdin: { write(data: string): void }; lastFrame(): string | undefined }) {
  act(() => {
    view.stdin.write('/')
  })
  await flush()
  return stripAnsi(view.lastFrame() ?? '').split('\n')
}

describe('hint box gestures', () => {
  it('press-release without movement picks the command under the cursor', async () => {
    const bridge = fakeBridge()
    const view = render(<App bridge={bridge} />)
    await flush()
    const lines = await openHints(view)
    const presetRow = lines.findIndex(line => line.includes('/preset'))
    expect(presetRow).toBeGreaterThan(0)

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 10, presetRow + 1, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(0, 10, presetRow + 1, false), 'latin1'))
    })
    await flush()
    const inputLine = stripAnsi(view.lastFrame() ?? '').split('\n').find(line => line.trim().startsWith('/preset'))
    expect(inputLine).toBeTruthy()
  })

  it('dragging inside the menu performs text selection instead of picking', async () => {
    const bridge = fakeBridge()
    const view = render(<App bridge={bridge} />)
    await flush()
    const lines = await openHints(view)
    const firstRow = lines.findIndex(line => line.includes('/models'))
    const sessionsRow = lines.findIndex(line => line.includes('/sessions'))

    let selectionSeen = false
    let y = firstRow
    while (y <= sessionsRow) {
      act(() => {
        if (y === firstRow) {
          fakeStdin.emit('data', Buffer.from(mouse(0, 6, y + 1, true), 'latin1'))
        }
        fakeStdin.emit('data', Buffer.from(mouse(32, 20, y + 1, true), 'latin1'))
      })
      await flush(10)
      if (/\x1b\[7m/.test(view.lastFrame() ?? '')) selectionSeen = true
      y += 1
    }

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(32, 20, sessionsRow + 1, false), 'latin1'))
    })
    await flush()

    const frame = view.lastFrame() ?? ''
    expect(selectionSeen).toBe(true)
    expect(stripAnsi(frame)).toContain('/sessions')
    expect(stripAnsi(frame).split('\n').some(line => line.includes('Open model selection'))).toBe(true)
  })

  it('a drag that ends outside the menu keeps the selection and does not run a command', async () => {
    const bridge = fakeBridge()
    const view = render(<App bridge={bridge} />)
    await flush()
    const lines = await openHints(view)
    const firstRow = lines.findIndex(line => line.includes('/models'))
    expect(firstRow).toBeGreaterThan(0)

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 6, firstRow + 1, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 20, Math.max(2, firstRow - 2), true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(0, 20, Math.max(2, firstRow - 2), false), 'latin1'))
    })
    await flush()
    const frame = view.lastFrame() ?? ''
    expect(/\x1b\[7m|\x1b\[48;5;\d+m/.test(frame)).toBe(true)
    expect(stripAnsi(frame)).toContain('/models')
    expect(bridge.send).not.toHaveBeenCalled()
  })

  it('drag selection aligns with the pressed screen columns', async () => {
    const bridge = fakeBridge()
    const view = render(<App bridge={bridge} />)
    await flush()
    const lines = await openHints(view)
    const row = lines.findIndex(line => line.includes('/sessions'))
    expect(row).toBeGreaterThan(0)

    act(() => {
      fakeStdin.emit('data', Buffer.from(mouse(0, 6, row + 1, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 7, row + 1, true), 'latin1'))
      fakeStdin.emit('data', Buffer.from(mouse(32, 13, row + 1, true), 'latin1'))
    })
    await flush()

    const rawRow = (view.lastFrame() ?? '').split('\n')[row] ?? ''
    const span = selectionSpan(rawRow)
    expect(span.startCol).toBe(6)
    expect(span.text).toBe('ession')
  })
})
