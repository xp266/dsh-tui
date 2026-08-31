import { describe, expect, it } from 'vitest'
import { CallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { formatThinkingDuration, initialTurnState, reduceChatEvent } from '../src/chat/store.ts'
import type { ChatToolPresenter } from '../src/chat/bridge.ts'
import type { Message } from '../src/model/message.ts'
import { rowInfoAt, rowIndexFor } from '../src/ui/message/layout.ts'

const WIDTH = 80

function userEvent(text: string): SessionEvent {
  return {
    type: 'user/message',
    seq: 1,
    time: 0,
    data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  }
}

function reasoning(text: string, step = 1, time = 0): SessionEvent {
  return { type: 'assistant/chunk', seq: 1, time, data: { turn: 1, step, chunk: { type: 'reasoning-delta', index: 0, text } } }
}

function textDelta(text: string, step = 1, time = 0): SessionEvent {
  return { type: 'assistant/chunk', seq: 1, time, data: { turn: 1, step, chunk: { type: 'text-delta', index: 0, text } } }
}

function toolCallDelta(callId: string, name: string, time = 0): SessionEvent {
  return {
    type: 'assistant/chunk',
    seq: 1,
    time,
    data: { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id: CallId(callId), name, argumentsDelta: '{}' } },
  }
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

function assistantMessage(step = 1, time = 0): SessionEvent {
  return {
    type: 'assistant/message',
    seq: 1,
    time,
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

  it('opens a fresh Thinking block for the next turn instead of appending', () => {
    const first = apply([], [reasoning('first'), assistantMessage(1), turnEnd()])
    expect(first.messages.filter(message => message.kind === 'collapsible')).toHaveLength(1)
    const second = apply(first.messages, [reasoning('second', 2), assistantMessage(2, 1)])
    const thinking = second.messages.filter(message => message.kind === 'collapsible' && message.thinking === true)
    expect(thinking).toHaveLength(2)
    expect(thinking[1]).toMatchObject({ body: 'second' })
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
    expect(messages[1]).toMatchObject({ label: 'Thought: 0ms', running: false, collapsed: true })
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
      data: { turn: 1, step: 1, callId: CallId('c1'), name: 'job_list', arguments: '{}' },
    }
    const presenter: ChatToolPresenter = {
      call: () => undefined,
      result: () => ({ kind: 'append', text: '' }),
      argsJson: () => '{\n  "jobs": []\n}',
    }
    const called = reduceChatEvent(messages, call, turn, presenter)
    const done = reduceChatEvent(called.messages, toolResult('c1', ''), called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ running: false, body: '{\n  "jobs": []\n}' })
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
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thought: 0ms', running: false })
  })

  it('labels a completed Thinking block with its wall-clock duration', () => {
    const state = apply([], [reasoning('r1', 1, 1_000), assistantMessage(1, 45_296)])
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thought: 44.2s', running: false })
  })

  it('ends the Thinking block at the first text delta of the same step', () => {
    const state = apply([], [reasoning('r1', 1, 1_000), textDelta('A', 1, 3_500)])
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thought: 2.5s', running: false })
    expect(state.messages[1]).toMatchObject({ kind: 'bubble', content: 'A' })
  })

  it('ends the Thinking block when a tool call starts streaming', () => {
    const state = apply([], [reasoning('r1', 1, 1_000), toolCallDelta('c7', 'bash', 2_600)])
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thought: 1.6s', running: false })
  })

  it('resumes and keeps the original start when reasoning continues after text', () => {
    let state = apply([], [reasoning('r1', 1, 1_000), textDelta('A', 1, 2_000)])
    expect(state.messages[0]).toMatchObject({ label: 'Thought: 1.0s', running: false })
    state = reduceChatEvent(state.messages, reasoning('r2', 1, 3_000), state.turn)
    expect(state.messages[0]).toMatchObject({ label: 'Thinking', running: true })
    state = reduceChatEvent(state.messages, textDelta('B', 1, 5_000), state.turn)
    expect(state.messages[0]).toMatchObject({ label: 'Thought: 4.0s', running: false })
  })

  it('keeps the Thinking label when the step assembles without chunk timestamps', () => {
    const started = apply([], [reasoning('r1')])
    const next = reduceChatEvent(
      started.messages,
      { type: 'assistant/message', seq: 1, data: { turn: 1, step: 1, message: createAssistantMessage({ content: [{ type: 'text', text: '' }], source: { provider: 'p', model: 'm' } }) } } as unknown as SessionEvent,
      started.turn,
    )
    expect(next.messages[0]).toMatchObject({ kind: 'collapsible', label: 'Thinking', running: false })
  })

  it('does not rewrite a settled Thought label when the step assembles later', () => {
    const state = apply([], [reasoning('r1', 1, 1_000), textDelta('A', 1, 3_500), assistantMessage(1, 60_000)])
    expect(state.messages[0]).toMatchObject({ label: 'Thought: 2.5s', running: false })
  })

  it('formats thinking durations compactly', () => {
    expect(formatThinkingDuration(0)).toBe('0ms')
    expect(formatThinkingDuration(6)).toBe('6ms')
    expect(formatThinkingDuration(10)).toBe('10ms')
    expect(formatThinkingDuration(999)).toBe('999ms')
    expect(formatThinkingDuration(1_000)).toBe('1.0s')
    expect(formatThinkingDuration(1_500)).toBe('1.5s')
    expect(formatThinkingDuration(2_098)).toBe('2.0s')
    expect(formatThinkingDuration(2_186)).toBe('2.1s')
    expect(formatThinkingDuration(45_296)).toBe('45.2s')
    expect(formatThinkingDuration(122_200)).toBe('2m 2.2s')
    expect(formatThinkingDuration(3_723_789)).toBe('1h 2m 3.7s')
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

  it('drops the diff body column when a result fails so the body aligns with the label', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const presenter: ChatToolPresenter = {
      call: () => ({ label: 'edit[src/a.ts]', body: '- a\n+ b', bodyCol: 2 }),
      result: () => undefined,
      argsJson: () => undefined,
    }
    const called = reduceChatEvent(messages, toolCall('c1'), turn, presenter)
    expect(called.messages[0]).toMatchObject({ bodyCol: 2 })
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
          content: [{ type: 'text', text: 'Error: file has not been read yet' }],
          isError: true,
        }),
      },
    }
    const done = reduceChatEvent(called.messages, failed, called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ body: 'error: boom\nError: file has not been read yet', bodyCol: undefined })
    const expanded = done.messages.map(message =>
      message.kind === 'collapsible' ? { ...message, collapsed: false } : message,
    )
    rowIndexFor(expanded, WIDTH)
    expect(rowInfoAt(expanded, WIDTH, 2)).toMatchObject({ kind: 'text', colStart: 4 })
  })

  it('keeps the presentation body column when a result succeeds', () => {
    let messages: Message[] = []
    let turn = initialTurnState()
    const presenter: ChatToolPresenter = {
      call: () => ({ label: 'edit[src/a.ts]', body: '- a\n+ b', bodyCol: 2 }),
      result: () => ({ kind: 'replace', text: '- a\n+ b', bodyCol: 2 }),
      argsJson: () => undefined,
    }
    const called = reduceChatEvent(messages, toolCall('c1'), turn, presenter)
    const done = reduceChatEvent(called.messages, toolResult('c1', ''), called.turn, presenter)
    expect(done.messages[0]).toMatchObject({ bodyCol: 2 })
  })
})

describe('ask_user_question bubble', () => {
  const askCall = (callId = 'a1'): SessionEvent => ({
    type: 'tool/call',
    seq: 1,
    time: 0,
    data: {
      turn: 1,
      step: 1,
      callId: CallId(callId),
      name: 'ask_user_question',
      arguments: JSON.stringify({
        questions: [
          { id: 'q1', question: '第一个问题', options: [{ label: 'A' }] },
          { id: 'q2', question: '第二个问题', multi_select: true },
        ],
      }),
    },
  })

  function askResult(callId = 'a1', overrides: { text?: string; isError?: boolean; error?: { name: string; code: string } } = {}): SessionEvent {
    return {
      type: 'tool/result',
      seq: 1,
      time: 0,
      data: {
        turn: 1,
        step: 1,
        ...overrides.error === undefined ? {} : { error: overrides.error },
        message: createToolResultMessage({
          callId: CallId(callId),
          content: [{
            type: 'text',
            text: overrides.text ?? JSON.stringify({ answers: [{ id: 'q1', selected: ['A'] }, { id: 'q2', selected: [], custom: '自定义' }] }),
          }],
          isError: overrides.isError === true,
        }),
      },
    }
  }

  it('shows a title-only bubble while the question is pending', () => {
    const state = apply([], [askCall()])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ kind: 'bubble', role: 'assistant', variant: 'ask-user', content: 'ask_user_question', pending: true })
  })

  it('renders questions and answers in the bubble once answered', () => {
    const state = apply([], [askCall(), askResult()])
    expect(state.messages[0]).toMatchObject({
      kind: 'bubble',
      role: 'assistant',
      variant: 'ask-user',
      pending: false,
      content: [
        'ask_user_question',
        '',
        '1. 第一个问题',
        '   A',
        '2. 第二个问题',
        '   自定义',
      ].join('\n'),
    })
  })

  it('aligns the answered bubble rows with an AI reply and keeps them gray', () => {
    const state = apply([], [askCall(), askResult()])
    rowIndexFor(state.messages, WIDTH)
    expect(rowInfoAt(state.messages, WIDTH, 0)).toMatchObject({ kind: 'pad', background: true })
    expect(rowInfoAt(state.messages, WIDTH, 1)).toMatchObject({ kind: 'text', colStart: 4, muted: true, text: 'ask_user_question' })
    expect(rowInfoAt(state.messages, WIDTH, 3)).toMatchObject({ kind: 'text', muted: true, text: '1. 第一个问题' })
    expect(rowInfoAt(state.messages, WIDTH, 4)).toMatchObject({ kind: 'text', muted: true, text: '   A' })
  })

  it('shows the failure text where answers would appear', () => {
    const state = apply([], [askCall(), askResult('a1', { text: 'Error: the user closed the question panel', isError: true })])
    expect(state.messages[0]).toMatchObject({
      variant: 'ask-user',
      content: 'ask_user_question\n\nError: the user closed the question panel',
    })
  })

  it('falls back to the event error identity when no result text exists', () => {
    const state = apply([], [askCall(), askResult('a1', { text: '', error: { name: 'AbortError', code: 'E_ABORT' } })])
    expect(state.messages[0]).toMatchObject({ content: 'ask_user_question\n\nerror: AbortError' })
  })
})

describe('todo_write bubble', () => {
  const todoArgs = {
    todos: [
      { content: '首先完成代码', status: 'completed' },
      { content: '构建项目', status: 'pending' },
    ],
  }
  const todoCall = (callId = 't1'): SessionEvent => ({
    type: 'tool/call',
    seq: 1,
    time: 0,
    data: { turn: 1, step: 1, callId: CallId(callId), name: 'todo_write', arguments: JSON.stringify(todoArgs) },
  })

  it('renders the checklist as a plain bubble from the call arguments', () => {
    const state = apply([], [todoCall()])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      kind: 'bubble',
      role: 'assistant',
      variant: 'todo',
      hang: 4,
      pending: true,
      content: [
        'todo_write',
        '',
        '[√] 首先完成代码',
        '[ ] 构建项目',
      ].join('\n'),
    })
  })

  it('keeps each todo_write call as its own bubble', () => {
    const updated = { todos: [{ content: '构建项目', status: 'in_progress' }] }
    const second: SessionEvent = {
      type: 'tool/call',
      seq: 2,
      time: 0,
      data: { turn: 1, step: 2, callId: CallId('t2'), name: 'todo_write', arguments: JSON.stringify(updated) },
    }
    const state = apply([], [todoCall(), second])
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toMatchObject({ variant: 'todo', content: 'todo_write\n\n[●] 构建项目' })
  })

  it('upgrades the checklist when the result carries the final list', () => {
    const finalList = { todos: [{ content: '构建项目', status: 'completed' }] }
    const result: SessionEvent = {
      type: 'tool/result',
      seq: 2,
      time: 0,
      data: {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId: CallId('t1'),
          content: [{ type: 'text', text: JSON.stringify(finalList) }],
          isError: false,
        }),
      },
    }
    const state = apply([], [todoCall(), result])
    expect(state.messages[0]).toMatchObject({ content: 'todo_write\n\n[√] 构建项目' })
  })

  it('aligns wrapped item lines under the first item text column', () => {
    const long = { todos: [{ content: 'a very long task description that certainly keeps going far beyond the wrap width used for this check', status: 'pending' }] }
    const call: SessionEvent = {
      type: 'tool/call',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, callId: CallId('t9'), name: 'todo_write', arguments: JSON.stringify(long) },
    }
    const state = apply([], [call])
    rowIndexFor(state.messages, WIDTH)
    const rows = [3, 4].map(offset => rowInfoAt(state.messages, WIDTH, offset))
    expect(rows[0]).toMatchObject({ kind: 'text', muted: true })
    expect(rows[0]!.text.startsWith('[ ] a very long')).toBe(true)
    expect(rows[1]!.text.startsWith('    ')).toBe(true)
    expect(rows[1]!.text).toBe('    ' + rows[1]!.text.trimStart())
  })
})

describe('write and edit tool diff bubbles', () => {
  function callDelta(callId: string, name: string, delta: string): SessionEvent {
    return {
      type: 'assistant/chunk',
      seq: 1,
      time: 0,
      data: { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id: CallId(callId), name, argumentsDelta: delta } },
    }
  }

  function commitCall(callId: string, name: string, args: object): SessionEvent {
    return {
      type: 'tool/call',
      seq: 2,
      time: 0,
      data: { turn: 1, step: 1, callId: CallId(callId), name, arguments: JSON.stringify(args) },
    }
  }

  function settleResult(
    callId: string,
    overrides: { meta?: { diffs: unknown }; error?: { name: string; code: string }; isError?: boolean } = {},
  ): SessionEvent {
    return {
      type: 'tool/result',
      seq: 3,
      time: 0,
      data: {
        turn: 1,
        step: 1,
        ...(overrides.error === undefined ? {} : { error: overrides.error }),
        ...(overrides.meta === undefined ? {} : { meta: overrides.meta as never }),
        message: createToolResultMessage({
          callId: CallId(callId),
          content: [{ type: 'text', text: 'The file has been updated successfully.' }],
          isError: overrides.isError === true,
        }),
      },
    }
  }

  it('shows only the header while write arguments stream, without any body', () => {
    const state = apply([], [
      callDelta('w1', 'write', '{"file_path":"/w/a.ts","content":"const a = 1'),
      callDelta('w1', 'write', '\\nconst b = 2'),
    ])
    expect(state.messages[0]).toMatchObject({ kind: 'tool-diff', tool: 'write', path: '/w/a.ts', streaming: true, hunks: [] })
  })

  it('computes the overwrite diff once at commit against the on-disk old text', () => {
    const events = [
      callDelta('w4', 'write', '{"file_path":"/w/over.ts","content":"keep\\nnew\\n'),
      callDelta('w4', 'write', 'tail"}'),
      commitCall('w4', 'write', { file_path: '/w/over.ts', content: 'keep\nnew\ntail' }),
    ]
    let messages: Message[] = []
    let turn = initialTurnState()
    for (const event of events) {
      const next = reduceChatEvent(messages, event, turn, undefined, {
        readFile: path => path === '/w/over.ts' ? 'keep\nold\ndropped' : null,
      })
      messages = next.messages
      turn = next.turn
    }
    expect(messages[0]).toMatchObject({
      kind: 'tool-diff',
      streaming: false,
      running: true,
      hunks: [[
        { kind: 'ctx', text: 'keep' },
        { kind: 'del', text: 'old' },
        { kind: 'del', text: 'dropped' },
        { kind: 'add', text: 'new' },
        { kind: 'add', text: 'tail' },
      ]],
    })
  })

  it('falls back to additions-only when the old file cannot be read', () => {
    const state = apply([], [
      commitCall('w5', 'write', { file_path: '/w/new-file.ts', content: 'a\nb' }),
    ])
    expect(state.messages[0]).toMatchObject({
      hunks: [[{ kind: 'add', text: 'a' }, { kind: 'add', text: 'b' }]],
    })
  })

  it('commits the full diff on tool/call and keeps the spinner off', () => {
    const state = apply([], [
      callDelta('w2', 'write', '{"file_path":"/w/b.py","content":"x = 1"}'),
      commitCall('w2', 'write', { file_path: '/w/b.py', content: 'x = 1\ny = 2' }),
    ])
    expect(state.messages[0]).toMatchObject({
      kind: 'tool-diff',
      path: '/w/b.py',
      streaming: false,
      running: true,
      hunks: [[{ kind: 'add', text: 'x = 1' }, { kind: 'add', text: 'y = 2' }]],
    })
  })

  it('shows only the header for edit while arguments stream and renders the diff once on commit', () => {
    const state = apply([], [
      callDelta('e1', 'edit', '{"file_path":"/w/c.ts","old_string":"a")'),
      commitCall('e1', 'edit', { file_path: '/w/c.ts', old_string: 'a', new_string: 'b' }),
    ])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      kind: 'tool-diff',
      tool: 'edit',
      path: '/w/c.ts',
      hunks: [[{ kind: 'del', text: 'a' }, { kind: 'add', text: 'b' }]],
      streaming: false,
    })
  })

  it('applies result meta diffs with context lines when the tool settles', () => {
    const state = apply([], [
      commitCall('e2', 'edit', { file_path: '/w/d.ts', old_string: 'a', new_string: 'b' }),
      settleResult('e2', {
        meta: { diffs: [{ path: '/w/d.ts', oldText: 'ctx\na\nctx', newText: 'ctx\nb\nctx' }] },
      }),
    ])
    expect(state.messages[0]).toMatchObject({
      running: false,
      hunks: [[
        { kind: 'ctx', text: 'ctx' },
        { kind: 'del', text: 'a' },
        { kind: 'add', text: 'b' },
        { kind: 'ctx', text: 'ctx' },
      ]],
    })
  })

  it('records the error on the bubble when the result fails', () => {
    const state = apply([], [
      commitCall('e3', 'edit', { file_path: '/w/e.ts', old_string: 'a', new_string: 'b' }),
      settleResult('e3', { error: { name: 'FS_NOT_FOUND', code: 'E_MISSING' } }),
    ])
    expect(state.messages[0]).toMatchObject({
      running: false,
      error: 'error: FS_NOT_FOUND The file has been updated successfully.',
    })
  })

  it('keeps the committed bubble when no presenter supplies structured views', () => {
    const state = apply([], [
      commitCall('w3', 'write', { file_path: 'f.txt', content: 'hi' }),
      settleResult('w3'),
    ])
    expect(state.messages[0]).toMatchObject({ kind: 'tool-diff', running: false, hunks: [[{ kind: 'add', text: 'hi' }]] })
  })
})

describe('agent activity tracking', () => {
  function turnStart(): SessionEvent {
    return { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } }
  }

  it('reports idle before any turn', () => {
    expect(initialTurnState()).toMatchObject({ running: false, phase: 'awaiting-request' })
  })

  it('marks the turn running and awaiting on turn/start', () => {
    const state = apply([], [turnStart()])
    expect(state.turn).toMatchObject({ running: true, phase: 'awaiting-request' })
  })

  it('switches to thinking while reasoning deltas stream', () => {
    const state = apply([], [turnStart(), reasoning('hmm')])
    expect(state.turn).toMatchObject({ running: true, phase: 'thinking' })
  })

  it('switches to working on text deltas and tool calls', () => {
    let state = apply([], [turnStart(), textDelta('Hi')])
    expect(state.turn).toMatchObject({ running: true, phase: 'working' })
    state = apply(state.messages, [toolCall('c9')])
    expect(state.turn).toMatchObject({ running: true, phase: 'working' })
  })

  it('returns to awaiting after each tool result', () => {
    const state = apply([], [turnStart(), toolCall('c1'), toolResult('c1', 'out')])
    expect(state.turn).toMatchObject({ running: true, phase: 'awaiting-request' })
  })

  it('clears running at turn end', () => {
    const state = apply([], [turnStart(), textDelta('Hi'), turnEnd()])
    expect(state.turn).toMatchObject({ running: false, phase: 'awaiting-request' })
  })

  it('shows a streaming placeholder on the first tool-call-delta and commits in place', () => {
    const state = apply([], [toolCallDelta('c7', 'bash'), toolCall('c7')])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ kind: 'collapsible', label: 'bash', running: true, collapsed: true })
    const committed = state.messages[0]!
    expect(committed.kind === 'collapsible' ? committed.streaming : undefined).toBe(false)
    expect(committed.kind === 'collapsible' ? committed.label.startsWith('bash') : false).toBe(true)
    expect(state.turn.toolIds.get('c7')).toBe(committed.id)
  })

  it('placeholder for ask-user uses the variant bubble with bare tool name', () => {
    const state = apply([], [toolCallDelta('c8', 'ask_user_question')])
    expect(state.messages[0]).toMatchObject({ kind: 'bubble', variant: 'ask-user', content: 'ask_user_question', streaming: true })
  })

  it('drops unresolved placeholders at turn end and clears streaming flags', () => {
    const state = apply([], [toolCallDelta('c9', 'bash'), turnEnd()])
    expect(state.messages).toHaveLength(0)
  })

  it('renders a registry command result as a labelled bubble', () => {
    function commandRun(id: string, name: string): SessionEvent {
      return { type: 'command/run', seq: 1, time: 0, data: { commandId: id, name } } as unknown as SessionEvent
    }
    function commandDone(id: string, kind: 'success' | 'error', text?: string): SessionEvent {
      return { type: 'command/done', seq: 2, time: 0, data: { commandId: id, kind, ...(text === undefined ? {} : { text }) } } as unknown as SessionEvent
    }
    const ok = apply([], [commandRun('k1', 'permission'), commandDone('k1', 'success', 'Permission preset: workspace-write.')])
    expect(ok.messages.at(-1)).toMatchObject({ kind: 'bubble', role: 'assistant', content: 'permission · Permission preset: workspace-write.' })
    expect(ok.messages).toHaveLength(1)

    const silent = apply([], [commandRun('k2', 'silent'), commandDone('k2', 'success')])
    expect(silent.messages).toHaveLength(0)
    expect(silent.turn.commandNames.size).toBe(0)

    const failed = apply([], [commandRun('k3', 'boom'), commandDone('k3', 'error', 'nope')])
    expect(failed.messages.at(-1)).toMatchObject({ kind: 'bubble', role: 'error', content: 'boom · nope' })
  })
})

describe('compaction events', () => {
  function compactionStart(id: string): SessionEvent {
    return { type: 'compaction/start', seq: 1, time: 0, data: { compactionId: id, turn: null } } as unknown as SessionEvent
  }
  function compactionSummary(id: string, text: string): SessionEvent {
    return {
      type: 'compaction/summary',
      seq: 2,
      time: 0,
      data: {
        compactionId: id,
        summary: [{ type: 'text', text }],
        shadowedRange: { start: 1, end: 9 },
        shadowedSeqs: [1, 2, 3, 4],
        shadowedTokenCount: 15300,
        provider: 'deepseek',
        model: 'deepseek-v4',
      },
    } as unknown as SessionEvent
  }  function compactionEnd(id: string, error?: string): SessionEvent {
    return { type: 'compaction/end', seq: 3, time: 0, data: { compactionId: id, turn: null, ...(error === undefined ? {} : { error }) } } as unknown as SessionEvent
  }
  function commandRun(commandId: string, name: string): SessionEvent {
    return { type: 'command/run', seq: 1, time: 0, data: { commandId, name } } as unknown as SessionEvent
  }
  function commandDone(commandId: string, kind: 'success' | 'error', text?: string): SessionEvent {
    return { type: 'command/done', seq: 2, time: 0, data: { commandId, kind, ...(text === undefined ? {} : { text }) } } as unknown as SessionEvent
  }

  it('shows a running bubble immediately and fills summary with stats when they arrive', () => {
    const started = apply([], [compactionStart('cp1')])
    expect(started.messages).toHaveLength(1)
    expect(started.messages[0]).toMatchObject({ kind: 'compaction', running: true, summary: '' })
    expect(started.turn.compacting).toBe(true)

    const done = apply([], [compactionStart('cp1'), compactionSummary('cp1', '- kept the plan\n- dropped the noise')])
    const message = done.messages[0]!
    expect(message.kind === 'compaction' && message.summary).toContain('dropped the noise')

    const ended = apply([], [compactionStart('cp1'), compactionSummary('cp1', 's'), compactionEnd('cp1')])
    expect(ended.messages[0]).toMatchObject({ kind: 'compaction', running: false })
    expect(ended.messages[0]!.kind === 'compaction' ? ended.messages[0]!.error : true).toBeUndefined()
    expect(ended.turn.compacting).toBe(false)
    expect(ended.turn.compactions.size).toBe(0)
  })

  it('records an end error on the bubble', () => {
    const state = apply([], [compactionStart('cp2'), compactionSummary('cp2', 'partial'), compactionEnd('cp2', 'summary diverged')])
    expect(state.messages[0]).toMatchObject({ kind: 'compaction', running: false, error: 'summary diverged' })
  })

  it('keeps the compaction alive across a turn boundary', () => {
    const state = apply([], [compactionStart('cp3'), turnEnd(), compactionSummary('cp3', 'still here')])
    expect(state.turn.compacting).toBe(true)
    expect(state.messages[0]).toMatchObject({ kind: 'compaction', summary: 'still here' })
  })

  it('suppresses the duplicate success command bubble for compact but keeps failures', () => {
    const manual = apply([], [
      commandRun('cmd-1', 'compact'),
      commandDone('cmd-1', 'success', 'Compacted 4 history items (~15.3k tokens).'),
    ])
    expect(manual.messages).toHaveLength(0)

    const failed = apply([], [commandRun('cmd-2', 'compact'), commandDone('cmd-2', 'error', 'busy')])
    expect(failed.messages.at(-1)).toMatchObject({ role: 'error', content: 'compact · busy' })
  })

  it('ignores orphan summary and end events for unknown compactions', () => {
    const state = apply([], [compactionSummary('ghost', 'x'), compactionEnd('ghost')])
    expect(state.messages).toHaveLength(0)
  })
})