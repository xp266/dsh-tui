import { describe, expect, it } from 'vitest'
import { FakeStdout, FakeStdin, installFakeStdin, restoreStdin, COLUMNS, ROWS } from './helpers/fake-stdio.ts'
import { render } from 'ink'
import type { RenderOptions } from 'ink'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import type { ScreenCapture } from '../src/terminal/screen.ts'
import { createScreenCapture } from '../src/terminal/screen.ts'
import { App } from '../src/ui/app.tsx'
import { createFakeBridge } from './helpers/fake-bridge.ts'

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
  const bridge = createFakeBridge({
    subscribe: (cb: Emit) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  })
  return Object.assign(bridge, {
    emit: ((event: SessionEvent) => {
      for (const listener of listeners) listener(event)
    }) as Emit,
  })
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
