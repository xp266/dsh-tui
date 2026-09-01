import { act } from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { ChatBridge } from '../src/chat/bridge.ts'
import { glyphs } from '../src/terminal/glyphs.ts'
import { App } from '../src/ui/app.tsx'
import { createFakeBridge } from './helpers/fake-bridge.ts'

function fakeBridge(): ChatBridge {
  return createFakeBridge()
}

async function flush(ms = 60): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

const SPINNER_CHARS = new Set(glyphs.spinnerFrames.join(''))

describe('tool streaming bubble', () => {
  it('shows the tool name during argument streaming and the full args on commit', async () => {
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
    expect(streamingFrame).not.toContain('"command": "ls"')

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
    // The committed card keeps a bare header: no protocol view, no secondary
    // parameter, so nothing is rendered below the tool name.
    expect(committedFrame).not.toContain('"command": "ls"')
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
    expect(streamingFrame).toContain('write')
    expect(streamingFrame).not.toContain('+ const a = 1')
    expect(streamingFrame).not.toContain('"file_path"')

    act(() => {
      handler?.({ type: 'tool/call', seq: 2, time: 0, data: { turn: 1, step: 1, callId: CallId('c9'), name: 'write', arguments: '{"file_path":"src/none/a.ts","content":"const a = 1\\nconst b = 2"}' } } as unknown as SessionEvent)
    })
    await flush(250)
    const committedFrame = stripAnsi(view.lastFrame() ?? '')
    expect(committedFrame).toContain('write')
    expect(committedFrame).not.toContain('"file_path"')
    expect(committedFrame).not.toContain('+ const')
  })

  it('holds the edit placeholder until the call commits, then shows the full arguments at once', async () => {
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
    expect(streamingFrame).toContain('edit')
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
    expect(committedFrame).toContain('edit')
    expect(committedFrame).not.toContain('"old_string"')
    expect(committedFrame).not.toContain('- old')
  })
})
