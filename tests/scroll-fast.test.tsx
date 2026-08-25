import { describe, expect, it, vi } from 'vitest'
import { FakeStdout, FakeStdin, installFakeStdin, restoreStdin, COLUMNS, ROWS } from './helpers/fake-stdio.ts'
import { render } from 'ink'
import type { RenderOptions } from 'ink'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import type { ScreenCapture } from '../src/terminal/screen.ts'
import { createScreenCapture } from '../src/terminal/screen.ts'
import { App } from '../src/ui/app.tsx'

function fakeScreenStub(): ScreenCapture {
  return {
    stream: process.stdout,
    feed: () => {},
    extract: () => '',
    extractSelection: () => '',
    rowHasText: () => true,
  }
}

type Emit = (event: SessionEvent) => void

function fakeBridge(): ChatBridge & { emit: Emit } {
  const listeners = new Set<Emit>()
  const bridge = {
    modelName: () => 'glm-4.7-flash',
    send: vi.fn(),
    interrupt: vi.fn(),
    subscribe: (cb: Emit) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
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
    emit: ((event: SessionEvent) => {
      for (const listener of listeners) listener(event)
    }) as Emit,
  }
  return bridge as ChatBridge & { emit: Emit }
}

async function flush(ms = 0): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function wheel(direction: 'up' | 'down', x: number, y: number): string {
  return `\x1b[<${direction === 'up' ? 64 : 65};${x};${y}M`
}

interface MountedApp {
  app: ReturnType<typeof render>
  stdout: FakeStdout
  stdin: FakeStdin
  originalDescriptor: PropertyDescriptor
  setBridge(bridge: ChatBridge): void
  pump(count: number, label?: string): Promise<void>
}

function mountApp(stdout: FakeStdout): MountedApp {
  const stdin = new FakeStdin()
  const originalDescriptor = installFakeStdin(stdin)
  let bridgeRef: ChatBridge | undefined
  let emitter: Emit | undefined
  const buildAppNode = (): React.ReactElement => <App bridge={bridgeRef} screen={fakeScreenStub()} />
  const options = {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    alternateScreen: true,
    maxFps: 240,
  } as RenderOptions
  const app = render(buildAppNode(), options)
  return {
    app,
    stdout,
    stdin,
    originalDescriptor,
    setBridge(bridge: ChatBridge): void {
      bridgeRef = bridge
      if ('emit' in bridge) emitter = (bridge as { emit: Emit }).emit
      app.rerender(buildAppNode())
    },
    async pump(count: number, label = 'tok'): Promise<void> {
      for (let i = 0; i < count; i++) {
        emitter?.({
          type: 'user/message',
          seq: i,
          time: 0,
          data: createUserMessage({ content: [{ type: 'text', text: `${label}-${i}-line-of-text` }], source: { kind: 'user' } }),
        } as SessionEvent)
      }
      await flush(300)
    },
  }
}

describe('scroll frame integrity', () => {
  it('wheel ticks produce bounded frames and never a full-screen erase', async () => {
    const stdout = new FakeStdout()
    const mounted = mountApp(stdout)
    mounted.setBridge(fakeBridge())
    await flush(250)
    await mounted.pump(80)

    // Sanity: the transcript actually rendered.
    const renderedBytes = stdout.chunks.join('').length
    expect(renderedBytes).toBeGreaterThan(2000)

    for (let tick = 0; tick < 6; tick++) {
      stdout.chunks.length = 0
      mounted.stdin.emit('data', Buffer.from(wheel('up', 40, 5), 'latin1'))
      await flush(60)
      const blob = stdout.chunks.join('')
      expect(blob).not.toContain('\x1b[2J')
      expect(blob.length).toBeLessThan(6000)
    }

    // Ledger consistency: a following keystroke repaints only the input row.
    stdout.chunks.length = 0
    mounted.stdin.emit('data', Buffer.from('x', 'utf8'))
    await flush(150)
    const typingBlob = stdout.chunks.join('')
    expect(typingBlob).not.toContain('tok-')
    expect(typingBlob.length).toBeLessThan(700)

    mounted.app.unmount()
    restoreStdin(mounted.originalDescriptor)
  })

  it('keeps the parsed screen consistent with the target content', async () => {
    const stdout = new FakeStdout()
    const capture = createScreenCapture()
    const mounted = mountApp(stdout)
    mounted.setBridge(fakeBridge())
    await flush(250)
    await mounted.pump(60, 'uniq')
    expect(stdout.chunks.join('').length).toBeGreaterThan(1500)
    for (const chunk of stdout.chunks) capture.feed(chunk)
    stdout.chunks.length = 0

    mounted.stdin.emit('data', Buffer.from(wheel('up', 40, 5), 'latin1'))
    await flush(80)
    for (const chunk of stdout.chunks) capture.feed(chunk)

    const screenAfter = capture.extract({ top: 0, bottom: ROWS - 8, left: 0, right: COLUMNS })
    const tokens = screenAfter.match(/uniq-(\d+)/g) ?? []
    expect(tokens.length).toBeGreaterThan(0)
    expect(new Set(tokens).size).toBe(tokens.length)

    mounted.app.unmount()
    restoreStdin(mounted.originalDescriptor)
  })
})
