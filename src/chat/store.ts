import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Message } from '../model/message.ts'
import { textFromBlocks } from './blocks.ts'

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
      messages.push({ kind: 'bubble', id: nextId('user'), role: 'user', content: textFromBlocks(event.data.content) })
      return { messages, turn }
    }
    case 'assistant/chunk': {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') return appendThinking(messages, turn, chunk.text)
      if (chunk.type === 'text-delta') return appendAssistant(messages, turn, chunk.text)
      return { messages, turn }
    }
    case 'tool/call': {
      const id = nextId('tool')
      turn.toolIds.set(event.data.callId, id)
      messages.push({ kind: 'collapsible', id, label: event.data.name, body: '', running: true, collapsed: false })
      return { messages, turn }
    }
    case 'tool/result': {
      const callId = event.data.message.content[0]?.toolCallId
      if (callId === undefined) return { messages, turn }
      const id = turn.toolIds.get(callId)
      if (id === undefined) return { messages, turn }
      const index = messages.findIndex(m => m.id === id)
      if (index < 0) return { messages, turn }
      const existing = messages[index]
      if (existing === undefined || existing.kind !== 'collapsible') return { messages, turn }
      const error = event.data.error
      const text = textFromBlocks(event.data.message.content)
      turn.toolIds.delete(callId)
      messages[index] = {
        kind: 'collapsible',
        id,
        label: existing.label,
        body: error === undefined ? text : `error: ${error.name ?? error.code}${text ? `\n${text}` : ''}`,
        running: false,
        collapsed: false,
      }
      return { messages, turn }
    }
    case 'turn/end': {
      if (turn.thinkingId !== null) {
        const thinkingIndex = messages.findIndex(m => m.id === turn.thinkingId)
        if (thinkingIndex >= 0) {
          const thinking = messages[thinkingIndex]
          if (thinking !== undefined && thinking.kind === 'collapsible' && thinking.body === '') {
            messages.splice(thinkingIndex, 1)
          } else if (thinking !== undefined && thinking.kind === 'collapsible') {
            messages[thinkingIndex] = { ...thinking, running: false, collapsed: false }
          }
        }
      }
      const reason = event.data.reason
      if (reason.kind === 'error') {
        messages.push({ kind: 'bubble', id: nextId('error'), role: 'error', content: `error: ${reason.error.message}` })
      }
      return { messages, turn: initialTurnState() }
    }
    default:
      return { messages, turn }
  }
}

function appendThinking(messages: Message[], turn: TurnState, text: string): { messages: Message[]; turn: TurnState } {
  if (turn.thinkingId === null) {
    const id = nextId('think')
    messages.push({ kind: 'collapsible', id, label: 'Thinking', body: text, running: true, collapsed: false })
    turn.thinkingId = id
    return { messages, turn }
  }
  const last = messages[messages.length - 1]
  if (last !== undefined && last.kind === 'collapsible' && last.id === turn.thinkingId) {
    last.body += text
    return { messages, turn }
  }
  const index = messages.findIndex(m => m.id === turn.thinkingId)
  if (index >= 0 && messages[index]?.kind === 'collapsible') {
    const target = messages[index]
    if (target !== undefined) target.body += text
  }
  return { messages, turn }
}

function appendAssistant(messages: Message[], turn: TurnState, text: string): { messages: Message[]; turn: TurnState } {
  if (turn.assistantId === null) {
    const id = nextId('ai')
    messages.push({ kind: 'bubble', id, role: 'assistant', content: text })
    turn.assistantId = id
    return { messages, turn }
  }
  const last = messages[messages.length - 1]
  if (last !== undefined && last.kind === 'bubble' && last.id === turn.assistantId) {
    last.content += text
    return { messages, turn }
  }
  const index = messages.findIndex(m => m.id === turn.assistantId)
  if (index >= 0 && messages[index]?.kind === 'bubble') {
    const target = messages[index]
    if (target !== undefined) target.content += text
  }
  return { messages, turn }
}