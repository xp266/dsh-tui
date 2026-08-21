import { describe, expect, it } from 'vitest'
import { CallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { initialTurnState, reduceChatEvent } from '../src/chat/store.ts'
import type { ChatToolPresenter } from '../src/chat/bridge.ts'
import type { Message } from '../src/model/message.ts'

function userEvent(text: string): SessionEvent {
  return {
    type: 'user/message',
    seq: 1,
    time: 0,
    data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  }
}

function reasoning(text: string, step = 1): SessionEvent {
  return { type: 'assistant/chunk', seq: 1, time: 0, data: { turn: 1, step, chunk: { type: 'reasoning-delta', index: 0, text } } }
}

function textDelta(text: string, step = 1): SessionEvent {
  return { type: 'assistant/chunk', seq: 1, time: 0, data: { turn: 1, step, chunk: { type: 'text-delta', index: 0, text } } }
}

function toolCall(callId: string): SessionEvent {
  return { type: 'tool/call', seq: 1, time: 0, data: { turn: 1, step: 1, callId: CallId(callId), name: 'bash', arguments: '{}' } }
}

function toolResult(callId: string, output: string): SessionEvent {
  return {
    type: 'tool/result',
    seq: 1,
    time: 0,
    data: {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId(callId),
        content: [{ type: 'text', text: output }],
        isError: false,
      }),
    },
  }
}

function turnEnd(): SessionEvent {
  return { type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind: 'completed' } } }
}

function assistantMessage(step = 1): SessionEvent {
  return {
    type: 'assistant/message',
    seq: 1,
    time: 0,
    data: {
      turn: 1,
      step,
      message: createAssistantMessage({ content: [{ type: 'text', text: '' }], source: { provider: 'p', model: 'm' } }),
    },
  }
}

function apply(initial: Message[], events: SessionEvent[]) {
  let messages = initial
  let turn = initialTurnState()
  for (const event of events) {
    const next = reduceChatEvent(messages, event, turn)
    messages = next.messages
    turn = next.turn
  }
  return { messages, turn }
}

function fakePresenter(): ChatToolPresenter {
  return {
    call: (_name, _callId, argumentsRaw) => {
      try {
        const args = JSON.parse(argumentsRaw) as { command?: string }
        return args.command === undefined
          ? undefined
          : { label: `bash[command=${args.command}]`, body: args.command }
      } catch {
        return undefined
      }
    },
    result: (_callId, result) => ({
      kind: 'append',
      text: result.content.map(block => block.type === 'text' ? block.text : '').join(''),
    }),
    argsJson: _callId => undefined,
  }
}

describe('chat event reducer', () => {
  it('appends a user bubble for user/message', () => {
    const { messages } = apply([], [userEvent('hello')])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ kind: 'bubble', role: 'user', content: 'hello' })
  })

  it('creates and appends the Thinking block from reasoning deltas', () => {
    let state = apply([], [reasoning('step 1'), reasoning(' step 2')])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thinking', running: true, body: 'step 1 step 2' })
    state = reduceChatEvent(state.messages, turnEnd(), state.turn)
    expect(state.messages[0]).toMatchObject({ running: false, collapsed: true })
  })

  it('streams assistant text into one bubble', () => {
    const { messages } = apply([], [textDelta('Hello '), textDelta('world')])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ kind: 'bubble', role: 'assistant', content: 'Hello world' })
  })

  it('tracks tool call and result as a collapsible pair', () => {
    let state = apply([], [toolCall('c1')])
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'bash', running: true, collapsed: true })
    state = reduceChatEvent(state.messages, toolResult('c1', 'out'), state.turn)
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'bash', running: false, collapsed: true, body: 'out' })
  })

  it('drops an empty Thinking block at turn end', () => {
    const { messages, turn } = apply([], [textDelta('no thinking')])
    const next = reduceChatEvent(messages, turnEnd(), turn)
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]).toMatchObject({ kind: 'bubble', content: 'no thinking' })
  })

  it('reassembles a full turn in order', () => {
    const { messages } = apply([], [userEvent('q'), reasoning('r'), toolCall('c1'), toolResult('c1', 'o'), textDelta('A'), textDelta('B'), turnEnd()])
    expect(messages).toHaveLength(4)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'q' })
    expect(messages[1]).toMatchObject({ label: 'Thinking', running: false, collapsed: true })
    expect(messages[2]).toMatchObject({ label: 'bash', running: false, collapsed: true, body: 'o' })
    expect(messages[3]).toMatchObject({ role: 'assistant', content: 'AB' })
  })

  it('marks a failed tool result as an error body', () => {
    let state = apply([], [toolCall('c1')])
    const failed: SessionEvent = {
      type: 'tool/result',
      seq: 1,
      time: 0,
      data: {
        turn: 1,
        step: 1,
        error: { name: 'boom', code: 'E_FAIL' },
        message: createToolResultMessage({
          callId: CallId('c1'),
          content: [{ type: 'text', text: 'stderr' }],
          isError: true,
        }),
      },
    }
    state = reduceChatEvent(state.messages, failed, state.turn)
    expect(state.messages[0]).toMatchObject({ body: 'error: boom\nstderr' })
  })

  it('ignores injected context messages that are not user-typed', () => {
    const injected: SessionEvent = {
      type: 'user/message',
      seq: 1,
      time: 0,
      data: {
        role: 'user',
        id: createUserMessage({ content: [{ type: 'text', text: 'x' }], source: { kind: 'user' } }).id,
        content: [{ type: 'text', text: 'Current runtime context...' }],
        source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
      },
    }
    const { messages } = apply([], [userEvent('hi'), injected])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hi' })
  })

  it('renders a failed turn as an error bubble', () => {
    const failed: SessionEvent = {
      type: 'turn/end',
      seq: 1,
      time: 0,
      data: {
        turn: 1,
        reason: { kind: 'error', error: { message: 'no API key', code: 'E_KEY' } },
      },
    }
    const { messages } = apply([], [userEvent('hi'), failed])
    expect(messages[1]).toMatchObject({ kind: 'bubble', role: 'error', content: 'error: no API key' })
  })

  it('shows the command while running and command plus output after the result', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const bashCall: SessionEvent = {
      type: 'tool/call',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{"command":"ls -a"}' },
    }
    const next = reduceChatEvent(messages, bashCall, turn, fakePresenter())
    messages = next.messages
    turn = next.turn
    expect(messages[0]).toMatchObject({ kind: 'collapsible', label: 'bash[command=ls -a]', running: true, body: 'ls -a' })
    const done = reduceChatEvent(messages, toolResult('c1', 'xx.xx'), turn, fakePresenter())
    expect(done.messages[0]).toMatchObject({ running: false, body: 'ls -a\n\nxx.xx' })
  })

  it('keeps only the command line when the result content is empty', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const call: SessionEvent = {
      type: 'tool/call',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{"command":"ls -a"}' },
    }
    const presenter: ChatToolPresenter = {
      ...fakePresenter(),
      result: () => ({ kind: 'append', text: '' }),
      argsJson: () => '{"command":"ls -a"}',
    }
    const called = reduceChatEvent(messages, call, turn, presenter)
    const done = reduceChatEvent(called.messages, toolResult('c1', ''), called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ running: false, body: 'ls -a' })
  })

  it('falls back to the argument JSON when neither command nor output exists', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const call: SessionEvent = {
      type: 'tool/call',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, callId: CallId('c1'), name: 'todo_write', arguments: '{"todos":[]}' },
    }
    const presenter: ChatToolPresenter = {
      call: () => undefined,
      result: () => ({ kind: 'append', text: '' }),
      argsJson: () => '{\n  "todos": []\n}',
    }
    const called = reduceChatEvent(messages, call, turn, presenter)
    const done = reduceChatEvent(called.messages, toolResult('c1', ''), called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ running: false, body: '{\n  "todos": []\n}' })
  })

  it('renders one Thinking row per step', () => {
    const { messages } = apply([], [reasoning('r1', 1), reasoning('r2', 2)])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thinking', running: true, body: 'r1' })
    expect(messages[1]).toMatchObject({ kind: 'collapsible', label: 'Thinking', running: true, body: 'r2' })
  })

  it('renders one assistant bubble per step', () => {
    const { messages } = apply([], [textDelta('A', 1), textDelta('B', 2)])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ kind: 'bubble', role: 'assistant', content: 'A' })
    expect(messages[1]).toMatchObject({ kind: 'bubble', role: 'assistant', content: 'B' })
  })

  it('does not create a bubble for a whitespace-only step', () => {
    const { messages } = apply([], [textDelta('\n\n', 1)])
    expect(messages).toHaveLength(0)
  })

  it('creates the bubble once accumulated text has content', () => {
    const { messages } = apply([], [textDelta('\n\n', 1), textDelta('Hello', 1)])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ kind: 'bubble', role: 'assistant', content: '\n\nHello' })
  })

  it('skips a whitespace-only step before a real step in the same turn', () => {
    const { messages } = apply([], [textDelta('\n\n', 1), toolCall('c1'), toolResult('c1', 'o'), textDelta('A', 2)])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ label: 'bash', body: 'o' })
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'A' })
  })

  it('does not carry pending whitespace into the next turn', () => {
    let state = apply([], [textDelta('\n\n', 1)])
    state = reduceChatEvent(state.messages, turnEnd(), state.turn)
    const next = reduceChatEvent(state.messages, textDelta('A', 1), state.turn)
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]).toMatchObject({ role: 'assistant', content: 'A' })
  })

  it('reports changed only when messages visually change', () => {
    const noise: SessionEvent = {
      type: 'assistant/chunk',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, chunk: { type: 'usage', index: 0 } },
    } as unknown as SessionEvent
    expect(reduceChatEvent([], noise, initialTurnState()).changed).toBe(false)
    let state = reduceChatEvent([], textDelta('\n\n', 1), initialTurnState())
    expect(state.changed).toBe(false)
    state = reduceChatEvent(state.messages, textDelta('A', 1), state.turn)
    expect(state.changed).toBe(true)
    const unhandled: SessionEvent = {
      type: 'permission/preset',
      seq: 1,
      time: 0,
      data: { preset: 'workspace-write' },
    } as unknown as SessionEvent
    expect(reduceChatEvent(state.messages, unhandled, state.turn).changed).toBe(true)
  })

  it('finalizes every Thinking row at turn end', () => {
    let state = apply([], [reasoning('r1', 1), reasoning('r2', 2)])
    const next = reduceChatEvent(state.messages, turnEnd(), state.turn)
    expect(next.messages).toHaveLength(2)
    expect(next.messages[0]).toMatchObject({ running: false, collapsed: true })
    expect(next.messages[1]).toMatchObject({ running: false, collapsed: true })
  })

  it('stops the Thinking spinner when its step assembles', () => {
    const state = apply([], [reasoning('r1'), assistantMessage(1)])
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thinking', running: false })
  })

  it('stops each Thinking row at its own step', () => {
    let state = apply([], [reasoning('r1', 1), assistantMessage(1), reasoning('r2', 2)])
    expect(state.messages[0]).toMatchObject({ running: false })
    expect(state.messages[1]).toMatchObject({ running: true })
    state = reduceChatEvent(state.messages, assistantMessage(2), state.turn)
    expect(state.messages[1]).toMatchObject({ running: false })
  })

  it('ignores assistant/message for steps without thinking', () => {
    const state = apply([], [textDelta('A'), assistantMessage(1)])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ kind: 'bubble', content: 'A' })
  })

  it('keeps a manually expanded tool open through its result', () => {
    let state = apply([], [toolCall('c1')])
    const tool = state.messages[0]
    if (tool !== undefined && tool.kind === 'collapsible') state.messages[0] = { ...tool, collapsed: false }
    state = reduceChatEvent(state.messages, toolResult('c1', 'out'), state.turn)
    expect(state.messages[0]).toMatchObject({ running: false, collapsed: false })
  })

  it('keeps a manually expanded Thinking open through turn end', () => {
    let state = apply([], [reasoning('r1')])
    const thinking = state.messages[0]
    if (thinking !== undefined && thinking.kind === 'collapsible') state.messages[0] = { ...thinking, collapsed: false }
    const next = reduceChatEvent(state.messages, turnEnd(), state.turn)
    expect(next.messages[0]).toMatchObject({ running: false, collapsed: false })
  })

  it('marks an interrupted tool call at turn end', () => {
    let state = apply([], [toolCall('c1')])
    const next = reduceChatEvent(state.messages, turnEnd(), state.turn)
    expect(next.messages[0]).toMatchObject({ running: false, body: '(no result)' })
  })

  it('replaces the body with structured content when the result presentation replaces', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const call: SessionEvent = {
      type: 'tool/call',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, callId: CallId('c1'), name: 'read', arguments: '{"file_path":"/w/src/main.py","offset":1}' },
    }
    const presenter: ChatToolPresenter = {
      call: () => ({ label: 'read[src/main.py, offset=1]', body: '{}', bodyCol: 1 }),
      result: () => ({ kind: 'replace', text: ' 1 aaa\n 2 bbb', bodyCol: 1 }),
      argsJson: () => '{}',
    }
    const called = reduceChatEvent(messages, call, turn, presenter)
    expect(called.messages[0]).toMatchObject({ label: 'read[src/main.py, offset=1]', body: '{}', bodyCol: 1 })
    const done = reduceChatEvent(called.messages, toolResult('c1', 'x'), called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ running: false, body: ' 1 aaa\n 2 bbb', bodyCol: 1 })
  })

  it('prefixes an error line when the replace presentation accompanies a failed result', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const presenter: ChatToolPresenter = {
      call: () => ({ label: 'read[x]', body: '' }),
      result: () => ({ kind: 'replace', text: 'raw' }),
      argsJson: () => undefined,
    }
    const called = reduceChatEvent(messages, toolCall('c1'), turn, presenter)
    const failed: SessionEvent = {
      type: 'tool/result',
      seq: 1,
      time: 0,
      data: {
        turn: 1,
        step: 1,
        error: { name: 'boom', code: 'E_FAIL' },
        message: createToolResultMessage({
          callId: CallId('c1'),
          content: [{ type: 'text', text: 'stderr' }],
          isError: true,
        }),
      },
    }
    const done = reduceChatEvent(called.messages, failed, called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ body: 'error: boom\nraw' })
  })
})