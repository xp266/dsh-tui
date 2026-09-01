import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { initialTurnState, reduceChatEvent, PLAN_TOOL_NAME } from '../src/chat/store.ts'
import type { Message } from '../src/model/message.ts'
import { rowInfoAt, rowCount } from '../src/ui/message/layout.ts'
import type { AskQuestionItemLike } from '../src/chat/interactions.ts'
import { isPlanReview } from '../src/ui/panels/question-model.ts'

const WIDTH = 60
const PLAN = '# Refactor storage\n\n- step one\n- step two'

function driver(): { messages: () => Message[]; fire: (event: SessionEvent) => void } {
  const turn = initialTurnState()
  let messages: Message[] = []
  return {
    messages: () => messages,
    fire(event) {
      const r = reduceChatEvent(messages, event, turn)
      messages = r.changed ? [...r.messages] : messages
    },
  }
}

function deltaChunk(callId: string, text: string): SessionEvent {
  return { type: 'assistant/chunk', data: { step: 1, chunk: { type: 'tool-call-delta', id: callId, name: PLAN_TOOL_NAME, argumentsDelta: text } } } as unknown as SessionEvent
}

describe('exit_plan_mode tool card', () => {
  it('streams a placeholder card and commits the full arguments', () => {
    const d = driver()
    d.fire({ type: 'turn/start', data: {} } as SessionEvent)
    const full = JSON.stringify({ plan: PLAN })
    const cut = full.indexOf('Refactor') + 4
    d.fire(deltaChunk('c1', full.slice(0, cut)))
    const streaming = d.messages()[0]
    expect(streaming).toMatchObject({ kind: 'tool-card', tool: PLAN_TOOL_NAME, streaming: true, running: true, argsBody: '' })
    d.fire({ type: 'tool/call', data: { callId: 'c1', name: PLAN_TOOL_NAME, arguments: full } } as unknown as SessionEvent)
    const committed = d.messages()[0]
    expect(committed).toMatchObject({ kind: 'tool-card', streaming: false, running: true, argsBody: '' })
  })

  it('settles the result and records keep-planning feedback as error', () => {
    const d = driver()
    d.fire({ type: 'turn/start', data: {} } as SessionEvent)
    d.fire({ type: 'tool/call', data: { callId: 'c1', name: PLAN_TOOL_NAME, arguments: JSON.stringify({ plan: PLAN }) } } as unknown as SessionEvent)
    d.fire({
      type: 'tool/result',
      data: { message: createToolResultMessage({ callId: CallId('c1'), content: [{ type: 'text', text: 'ok' }], isError: false }) },
    } as unknown as SessionEvent)
    expect(d.messages()[0]).toMatchObject({ kind: 'tool-card', running: false, resultBody: 'ok' })
    expect((d.messages()[0] as { error?: string }).error).toBeUndefined()

    const e = driver()
    e.fire({ type: 'turn/start', data: {} } as SessionEvent)
    e.fire({ type: 'tool/call', data: { callId: 'c2', name: PLAN_TOOL_NAME, arguments: JSON.stringify({ plan: PLAN }) } } as unknown as SessionEvent)
    e.fire({
      type: 'tool/result',
      data: { error: { name: 'feedback' }, message: createToolResultMessage({ callId: CallId('c2'), content: [{ type: 'text', text: 'make it faster' }], isError: true }) },
    } as unknown as SessionEvent)
    expect(e.messages()[0]).toMatchObject({ kind: 'tool-card', running: false, error: 'error: feedback' })
  })
})

describe('plan bubble layout', () => {
  it('renders the compaction-like shell with a muted header and md body', () => {
    const messages: Message[] = [{ kind: 'plan', id: 'p1', body: PLAN }]
    const total = rowCount(messages, WIDTH)
    expect(total).toBeGreaterThanOrEqual(7)
    expect(rowInfoAt(messages, WIDTH, 0)).toMatchObject({ kind: 'pad', background: true })
    const header = rowInfoAt(messages, WIDTH, 1)
    expect(header).toMatchObject({ kind: 'text', text: 'exit_plan_mode', colStart: 4, background: true, muted: true })
    expect(header?.spinner ?? false).toBe(false)
    expect(rowInfoAt(messages, WIDTH, 2)).toMatchObject({ kind: 'pad', background: true })
    expect(rowInfoAt(messages, WIDTH, 3)?.kind).toBe('text')
    expect(rowInfoAt(messages, WIDTH, total - 2)).toMatchObject({ kind: 'pad', background: true })
    expect(rowInfoAt(messages, WIDTH, total - 1)).toMatchObject({ kind: 'blank' })
    expect(total - 6).toBeGreaterThanOrEqual(1)
    const errorCase: Message[] = [{ kind: 'plan', id: 'p2', body: '', error: 'make it faster' }]
    expect(rowInfoAt(errorCase, WIDTH, 3)?.kind).toBe('text')
  })

  it('shows an empty streaming shell before any content arrives', () => {
    const messages: Message[] = [{ kind: 'plan', id: 'p1', body: '', streaming: true }]
    expect(rowCount(messages, WIDTH)).toBe(4)
    expect(rowInfoAt(messages, WIDTH, 3)).toMatchObject({ kind: 'blank' })
  })
})

describe('plan-review panel suppression', () => {
  it('detects plan-review intent questions', () => {
    const review: AskQuestionItemLike = { id: 'plan-review', question: 'q', intent: { kind: 'plan-review', approve: 'Approve' } }
    const plain: AskQuestionItemLike = { id: 'q1', question: 'q' }
    expect(isPlanReview(review)).toBe(true)
    expect(isPlanReview(plain)).toBe(false)
  })
})
