import { describe, it, expect } from 'vitest'
import { reduceChatEvent, initialTurnState } from '/home/xp266/ts/dsh-tui/src/chat/store.ts'
import type { Message } from '/home/xp266/ts/dsh-tui/src/model/message.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

describe('thinking lifecycle across turns', () => {
  it('turn 2 opens a fresh thinking bubble instead of appending to turn 1', () => {
    const turn = initialTurnState()
    let messages: Message[] = []
    const fire = (event: SessionEvent): void => {
      const r = reduceChatEvent(messages, event, turn)
      messages = r.changed ? [...r.messages] : messages
    }
    const chunk = (type: string, extra: object, step: number): SessionEvent =>
      ({ type: 'assistant/chunk', data: { step, chunk: { type, ...extra } } }) as unknown as SessionEvent
    const msg = (step: number, reasoning: string, text: string): SessionEvent =>
      ({ type: 'assistant/message', data: { step, message: { role: 'assistant', content: [
        ...(reasoning === '' ? [] : [{ type: 'reasoning', text: reasoning }]),
        ...(text === '' ? [] : [{ type: 'text', text }]),
      ] } } } as unknown as SessionEvent)

    fire({ type: 'turn/start', data: {} } as SessionEvent)
    fire(chunk('reasoning-delta', { text: 't1 thoughts' }, 1))
    fire(chunk('text-delta', { text: 'answer one' }, 1))
    fire(msg(1, 't1 thoughts', 'answer one'))
    fire({ type: 'turn/end', data: { reason: { kind: 'completed' } } } as unknown as SessionEvent)

    const thinkCountAfterT1 = messages.filter(m => m.kind === 'collapsible' && m.thinking).length
    expect(thinkCountAfterT1).toBe(1)

    fire({ type: 'turn/start', data: {} } as SessionEvent)
    fire(chunk('reasoning-delta', { text: 't2 thoughts' }, 1))
    fire(chunk('text-delta', { text: 'answer two' }, 1))
    fire(msg(1, 't2 thoughts', 'answer two'))
    fire({ type: 'turn/end', data: { reason: { kind: 'completed' } } } as unknown as SessionEvent)

    const thinks = messages.filter(m => m.kind === 'collapsible' && m.thinking) as { body: string; running: boolean }[]
    expect(thinks.map(t => t.body)).toEqual(['t1 thoughts', 't2 thoughts'])
    const texts = messages.filter(m => m.kind === 'bubble' && m.role === 'assistant') as { content: string }[]
    expect(texts.map(t => t.content)).toEqual(['answer one', 'answer two'])
    expect(thinks.every(t => !t.running)).toBe(true)
  })
})
