import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { SPINNER_FRAMES } from '../src/ui/message/layout.ts'
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
    interactions: undefined as never,
  } as unknown as ChatBridge
}

async function flush(ms = 60): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

const SPINNER_CHARS = new Set(SPINNER_FRAMES.join(''))

describe('tool streaming bubble', () => {
  it('shows the spinner next to the tool name during argument streaming and drops it on commit', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} />)
    await flush()

    act(() => {
      handler?.({
        type: 'assistant/chunk',
        seq: 1,
        time: 0,
        data: { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id: CallId('c1'), name: 'bash', argumentsDelta: '{"command":"ls' } },
      } as unknown as SessionEvent)
    })
    await flush(250)
    const streamingFrame = stripAnsi(view.lastFrame() ?? '')
    const labelLine = streamingFrame.split('\n').find(line => line.includes('bash'))
    expect(labelLine).toBeTruthy()
    const hasSpinnerChar = [...(labelLine ?? '')].some(ch => SPINNER_CHARS.has(ch))
    expect(hasSpinnerChar).toBe(true)

    act(() => {
      handler?.({
        type: 'tool/call',
        seq: 2,
        time: 0,
        data: { turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{"command":"ls"}' },
      } as unknown as SessionEvent)
    })
    await flush(250)
    const committedFrame = stripAnsi(view.lastFrame() ?? '')
    const committedLine = committedFrame.split('\n').find(line => line.includes('bash'))
    expect(committedLine).toBeTruthy()
    expect([...(committedLine ?? '')].some(ch => SPINNER_CHARS.has(ch))).toBe(false)
  })

  it('renders the ask-user placeholder with spinner then settles to the bare tool name', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} />)
    await flush()

    act(() => {
      handler?.({
        type: 'assistant/chunk',
        seq: 1,
        time: 0,
        data: { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id: CallId('q1'), name: 'ask_user_question', argumentsDelta: '{' } },
      } as unknown as SessionEvent)
    })
    await flush(250)
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('ask_user_question')
    expect([...stripAnsi(view.lastFrame() ?? '')].some(ch => SPINNER_CHARS.has(ch))).toBe(true)

    act(() => {
      handler?.({
        type: 'tool/call',
        seq: 2,
        time: 0,
        data: { turn: 1, step: 1, callId: CallId('q1'), name: 'ask_user_question', arguments: '{}' },
      } as unknown as SessionEvent)
    })
    await flush(250)
    const settledFrame = stripAnsi(view.lastFrame() ?? '')
    const settledLine = settledFrame.split('\n').find(line => line.includes('ask_user_question'))
    expect(settledLine).toBeTruthy()
    expect([...(settledLine ?? '')].some(ch => SPINNER_CHARS.has(ch))).toBe(false)
  })

  it('holds the write body during argument streaming and shows the diff at commit', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} />)
    await flush()

    act(() => {
      handler?.({
        type: 'assistant/chunk',
        seq: 1,
        time: 0,
        data: {
          turn: 1,
          step: 1,
          chunk: { type: 'tool-call-delta', index: 0, id: CallId('c9'), name: 'write', argumentsDelta: '{"file_path":"src/none/a.ts","content":"const a = 1' },
        },
      } as unknown as SessionEvent)
    })
    await flush(250)
    const streamingFrame = stripAnsi(view.lastFrame() ?? '')
    expect(streamingFrame).toContain('write src/none/a.ts')
    expect(streamingFrame).not.toContain('+ const a = 1')
    expect([...streamingFrame].some(ch => SPINNER_CHARS.has(ch))).toBe(true)

    act(() => {
      handler?.({ type: 'tool/call', seq: 2, time: 0, data: { turn: 1, step: 1, callId: CallId('c9'), name: 'write', arguments: '{"file_path":"src/none/a.ts","content":"const a = 1\\nconst b = 2"}' } } as unknown as SessionEvent)
    })
    await flush(250)
    const committedFrame = stripAnsi(view.lastFrame() ?? '')
    expect(committedFrame).toContain('+ const b = 2')
    const bubbleLines = committedFrame.split('\n').filter(line => line.includes('write src/none/a.ts') || line.trimStart().startsWith('+ const'))
    expect(bubbleLines.length).toBeGreaterThan(0)
    expect(bubbleLines.some(line => [...line].some(ch => SPINNER_CHARS.has(ch)))).toBe(false)
  })

  it('holds the edit body until the call commits, then shows the full diff at once', async () => {
    const bridge = fakeBridge()
    let handler: ((event: SessionEvent) => void) | undefined
    bridge.subscribe = cb => {
      handler = cb
      return () => {}
    }
    const view = render(<App bridge={bridge} />)
    await flush()

    act(() => {
      handler?.({
        type: 'assistant/chunk',
        seq: 1,
        time: 0,
        data: {
          turn: 1,
          step: 1,
          chunk: { type: 'tool-call-delta', index: 0, id: CallId('c10'), name: 'edit', argumentsDelta: '{"file_path":"src/b.ts","old_string":"old",' },
        },
      } as unknown as SessionEvent)
    })
    await flush(250)
    const streamingFrame = stripAnsi(view.lastFrame() ?? '')
    expect(streamingFrame).toContain('edit src/b.ts')
    expect(streamingFrame).not.toContain('- old')

    act(() => {
      handler?.({
        type: 'tool/call',
        seq: 2,
        time: 0,
        data: { turn: 1, step: 1, callId: CallId('c10'), name: 'edit', arguments: '{"file_path":"src/b.ts","old_string":"old","new_string":"new"}' },
      } as unknown as SessionEvent)
    })
    await flush(250)
    const committedFrame = stripAnsi(view.lastFrame() ?? '')
    expect(committedFrame).toContain('- old')
    expect(committedFrame).toContain('+ new')
  })
})
