import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Message } from '../state/messages.ts'

export interface TurnState {
  thinkingId: string | null
  assistantId: string | null
  toolIds: Map<string, string>
}

export function initialTurnState(): TurnState {
  return { thinkingId: null, assistantId: null, toolIds: new Map() }
}

let messageCounter = 0

function nextId(prefix: string): string {
  messageCounter += 1
  return `${prefix}-${messageCounter}`
}

export function reduceChatEvent(
  messages: Message[],
  event: SessionEvent,
  turn: TurnState,
): { messages: Message[]; turn: TurnState } {
  switch (event.type) {
    case 'user/message': {
      if (event.data.source.kind !== 'user') return { messages, turn }
      return {
        messages: [...messages, { kind: 'bubble', id: nextId('user'), role: 'user', content: textFromBlocks(event.data.content) }],
        turn,
      }
    }
    case 'assistant/chunk': {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') return appendThinking(messages, turn, chunk.text)
      if (chunk.type === 'text-delta') return appendAssistant(messages, turn, chunk.text)
      return { messages, turn }
    }
    case 'tool/call': {
      const id = nextId('tool')
      const toolIds = new Map(turn.toolIds)
      toolIds.set(event.data.callId, id)
      return {
        messages: [...messages, { kind: 'collapsible', id, label: event.data.name, body: '', running: true, collapsed: false }],
        turn: { ...turn, toolIds },
      }
    }
    case 'tool/result': {
      const callId = event.data.message.content[0]?.toolCallId
      if (callId === undefined) return { messages, turn }
      const id = turn.toolIds.get(callId)
      if (id === undefined) return { messages, turn }
      const existing = messages.find(m => m.id === id)
      if (existing === undefined || existing.kind !== 'collapsible') return { messages, turn }
      const error = event.data.error
      const text = textFromBlocks(event.data.message.content)
      const toolIds = new Map(turn.toolIds)
      toolIds.delete(callId)
      return {
        messages: messages.map(m =>
          m.id === id
            ? {
                kind: 'collapsible',
                id,
                label: existing.label,
                body: error === undefined ? text : `error: ${error.name ?? error.code}${text ? `\n${text}` : ''}`,
                running: false,
                collapsed: false,
              }
            : m,
        ),
        turn: { ...turn, toolIds },
      }
    }
    case 'turn/end': {
      let next = messages
      if (turn.thinkingId !== null) {
        const thinking = next.find(m => m.id === turn.thinkingId)
        if (thinking !== undefined && thinking.kind === 'collapsible' && thinking.body === '') {
          next = next.filter(m => m.id !== turn.thinkingId)
        } else {
          next = next.map(m =>
            m.id === turn.thinkingId && m.kind === 'collapsible'
              ? { ...m, running: false, collapsed: false }
              : m,
          )
        }
      }
      const reason = event.data.reason
      if (reason.kind === 'error') {
        next = [...next, { kind: 'bubble', id: nextId('error'), role: 'error', content: `error: ${reason.error.message}` }]
      }
      return { messages: next, turn: initialTurnState() }
    }
    default:
      return { messages, turn }
  }
}

function appendThinking(messages: Message[], turn: TurnState, text: string): { messages: Message[]; turn: TurnState } {
  if (turn.thinkingId === null) {
    const id = nextId('think')
    return {
      messages: [...messages, { kind: 'collapsible', id, label: 'Thinking', body: text, running: true, collapsed: false }],
      turn: { ...turn, thinkingId: id },
    }
  }
  return {
    messages: messages.map(m => (m.id === turn.thinkingId && m.kind === 'collapsible' ? { ...m, body: m.body + text } : m)),
    turn,
  }
}

function appendAssistant(messages: Message[], turn: TurnState, text: string): { messages: Message[]; turn: TurnState } {
  if (turn.assistantId === null) {
    const id = nextId('ai')
    return {
      messages: [...messages, { kind: 'bubble', id, role: 'assistant', content: text }],
      turn: { ...turn, assistantId: id },
    }
  }
  return {
    messages: messages.map(m => (m.id === turn.assistantId && m.kind === 'bubble' ? { ...m, content: m.content + text } : m)),
    turn,
  }
}

function textFromBlocks(blocks: ContentBlock[]): string {
  let text = ''
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool-result') text += textFromBlocks(block.content)
  }
  return text
}