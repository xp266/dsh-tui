import { describe, expect, it, vi } from 'vitest'
import { FakeStdout, FakeStdin, installFakeStdin, restoreStdin } from './helpers/fake-stdio.ts'
import { render } from 'ink'
import type { RenderOptions } from 'ink'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import type { ScreenCapture } from '../src/terminal/screen.ts'
import { App } from '../src/ui/app.tsx'

const COLUMNS = 100
const ROWS = 30

function fakeBridge(): ChatBridge & { emit: (event: SessionEvent) => void } {
  const listeners = new Set<(event: SessionEvent) => void>()
  const bridge = {
    modelName: () => 'glm-4.7-flash',
    send: vi.fn(),
    interrupt: vi.fn(),
    subscribe: (cb: (event: SessionEvent) => void) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
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
    }) as (event: SessionEvent) => void,
  }
  return bridge as ChatBridge & { emit: (event: SessionEvent) => void }
}

async function flush(ms = 0): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('input bar integrity during fast scrolling', () => {
  it('keeps input-area rows byte-identical across rapid ctrl+u page scrolls', async () => {
    const stdout = new FakeStdout()
    const stdin = new FakeStdin()
    const originalDescriptor = installFakeStdin(stdin)
    try {
      const listeners = new Set<(e: SessionEvent) => void>()
      let bridgeRef: ChatBridge | undefined
      let emitter: ((e: SessionEvent) => void) | undefined
      const buildAppNode = (): React.ReactElement => <App bridge={bridgeRef} screen={{ stream: process.stdout, feed: () => {}, extract: () => '', extractSelection: () => '', rowHasText: () => true }} />
      const bridge = (() => {
        const b = fakeBridge()
        b.subscribe = cb => {
          listeners.add(cb)
          return () => {
            listeners.delete(cb)
          }
        }
        return b
      })()
      const app = render(buildAppNode(), {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: stdin as unknown as NodeJS.ReadStream,
        exitOnCtrlC: false,
        alternateScreen: true,
        maxFps: 240,
      } as RenderOptions)
      await flush(250)
      bridgeRef = bridge
      emitter = bridge.emit
      app.rerender(buildAppNode())
      await flush(250)
      // Type something first so the caret row has content.
      stdin.emit('data', Buffer.from('hello world', 'utf8'))
      await flush(80)
      for (let i = 0; i < 120; i++) {
        for (const listener of listeners) {
          listener({
            type: 'user/message',
            seq: i,
            time: 0,
            data: createUserMessage({ content: [{ type: 'text', text: `tok-${i}-line-of-chat-transcript-content` }], source: { kind: 'user' } }),
          } as SessionEvent)
        }
      }
      await flush(300)

      const log = (app as unknown as { log?: { getRow(y: number): string | undefined } }).log
      expect(log).toBeDefined()
      ;(globalThis as { __MH_LOG?: unknown[] }).__MH_LOG = []

      // Input area rows: text row 25..27 for ROWS=30 (frame bottom 4 rows).
      const sample = (): string[] =>
        [24, 25, 26, 27, 28].map(y => `${y}:${log!.getRow(y) ?? '∅'}`)

      const baseline = sample()
      const beforeTranscript = [0, 8, 16, 23].map(y => `${y}:${log!.getRow(y) ?? '∅'}`)
      const transcriptSample = (): string[] => [0, 8, 16, 23].map(y => `${y}:${log!.getRow(y) ?? '∅'}`)
      const state: { drift: { tick: number; after: string[] } | null } = { drift: null }
      const check = (tick: number): void => {
        if (state.drift !== null) return
        const after = sample()
        if (after.some((v, i) => v !== baseline[i])) {
          state.drift = { tick, after }
        }
      }
      ;(globalThis as { __MH_LOG?: unknown[] }).__MH_LOG = []
      // Real key-repeat: terminal coalesces held ctrl+u/ctrl+d into one chunk.
      const transcriptBefore = sample().slice(0, 24).join('')
      for (let burst = 0; burst < 4 && state.drift === null; burst++) {
        stdin.emit('data', Buffer.from('\x15\x15\x04\x15\x04'.repeat(6), 'utf8'))
        await flush(40)
        check(burst * 10)
      }
      // Pattern B: rapid individual events without settling.
      for (let i = 0; i < 60 && state.drift === null; i++) {
        stdin.emit('data', Buffer.from(i % 3 === 0 ? '\x04' : '\x15', 'utf8'))
        if (i % 7 === 0) await flush(0)
        check(100 + i)
      }
      await flush(120)
      check(999)

      // Scrolling must actually have happened, otherwise this test is vacuous.
      const transcriptAfter = transcriptSample().join('')
      if (process.env.DBG_LATE !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').appendFileSync('/tmp/opencode/erosion.txt', `scrolled=${transcriptAfter !== beforeTranscript.join('')}\nrow0after=${transcriptSample()[0]?.slice(0, 80)}\n`)
      }
      expect(transcriptAfter).not.toBe(beforeTranscript.join(''))

      expect(state.drift, `input rows drifted:\n${state.drift?.after.join('\n')}`).toBeNull()

      app.unmount()
    } finally {
      restoreStdin(originalDescriptor)
    }
  })
})

