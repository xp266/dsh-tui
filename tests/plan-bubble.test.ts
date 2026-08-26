import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { initialTurnState, reduceChatEvent, PLAN_TOOL_NAME } from '../src/chat/store.ts'
import type { Message, PlanMessage } from '../src/model/message.ts'
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

function planOf(messages: readonly Message[]): PlanMessage | undefined {
  return messages.find((m): m is PlanMessage => m.kind === 'plan')
}

describe('exit_plan_mode plan bubble', () => {
  it('streams partial markdown into the bubble and finalizes at commit', () => {
    const d = driver()
    d.fire({ type: 'turn/start', data: {} } as SessionEvent)
    const full = JSON.stringify({ plan: PLAN })
    const cut = full.indexOf('Refactor') + 4
    d.fire(deltaChunk('c1', full.slice(0, cut)))
    const streaming = planOf(d.messages())
    expect(streaming?.streaming).toBe(true)
    expect(streaming?.body).toBe(PLAN.slice(0, cut - '{"plan":"'.length))
    d.fire(deltaChunk('c1', full.slice(cut)))
    expect(planOf(d.messages())?.body).toBe(PLAN)
    d.fire({ type: 'tool/call', data: { callId: 'c1', name: PLAN_TOOL_NAME, arguments: full } } as unknown as SessionEvent)
    const committed = planOf(d.messages())
    expect(committed?.streaming).toBe(false)
    expect(committed?.running).toBe(true)
    expect(committed?.body).toBe(PLAN)
  })

  it('closes on approval and records keep-planning feedback as error', () => {
    const d = driver()
    d.fire({ type: 'turn/start', data: {} } as SessionEvent)
    d.fire(deltaChunk('c1', JSON.stringify({ plan: PLAN })))
    d.fire({ type: 'tool/call', data: { callId: 'c1', name: PLAN_TOOL_NAME, arguments: JSON.stringify({ plan: PLAN }) } } as unknown as SessionEvent)
    const resultBase = { message: { role: 'tool', content: [{ type: 'text', text: 'ok', toolCallId: 'c1' }] }, meta: undefined }
    void resultBase.meta
    d.fire({ type: 'tool/result', data: resultBase } as unknown as SessionEvent)
    expect(planOf(d.messages())?.running).toBe(false)
    expect(planOf(d.messages())?.error).toBeUndefined()

    const e = driver()
    e.fire({ type: 'turn/start', data: {} } as SessionEvent)
    e.fire(deltaChunk('c2', JSON.stringify({ plan: PLAN })))
    e.fire({ type: 'tool/call', data: { callId: 'c2', name: PLAN_TOOL_NAME, arguments: JSON.stringify({ plan: PLAN }) } } as unknown as SessionEvent)
    e.fire({ type: 'tool/result', data: { ...resultBase, error: { name: 'feedback' }, message: { role: 'tool', content: [{ type: 'text', text: 'make it faster', isError: true, toolCallId: 'c2' }] } } } as unknown as SessionEvent)
    const failed = planOf(e.messages())
    expect(failed?.running).toBe(false)
    expect(failed?.error).toContain('make it faster')
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
