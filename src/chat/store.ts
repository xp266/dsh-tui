import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Message } from '../model/message.ts'
import { textFromBlocks } from './blocks.ts'
import type { ChatToolPresenter, ToolResultLike } from './bridge.ts'

export interface TurnState {
  thinkingIds: Map<number, string>
  assistantIds: Map<number, string>
  toolIds: Map<string, string>
}

export function initialTurnState(): TurnState {
  return { thinkingIds: new Map(), assistantIds: new Map(), toolIds: new Map() }
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
  presenter?: ChatToolPresenter,
): { messages: Message[]; turn: TurnState } {
  switch (event.type) {
    case 'user/message': {
      if (event.data.source.kind !== 'user') return { messages, turn }
      messages.push({ kind: 'bubble', id: nextId('user'), role: 'user', content: textFromBlocks(event.data.content) })
      return { messages, turn }
    }
    case 'assistant/chunk': {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') return appendThinking(messages, turn, chunk.text, event.data.step)
      if (chunk.type === 'text-delta') return appendAssistant(messages, turn, chunk.text, event.data.step)
      return { messages, turn }
    }
    case 'tool/call': {
      const id = nextId('tool')
      turn.toolIds.set(event.data.callId, id)
      const view = presenter?.call(event.data.name, event.data.callId, event.data.arguments)
      messages.push({
        kind: 'collapsible',
        id,
        label: view?.label ?? event.data.name,
        body: view?.body ?? '',
        running: true,
        collapsed: false,
        ...view?.bodyCol === undefined ? {} : { bodyCol: view.bodyCol },
      })
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
      const block = event.data.message.content[0]
      const result: ToolResultLike = {
        content: block?.content ?? [],
        isError: block?.isError === true,
        ...event.data.meta === undefined ? {} : { meta: event.data.meta },
      }
      const presentation = presenter?.result(callId, result)
      if (presentation !== undefined && presentation.kind === 'replace') {
        const body = error === undefined
          ? presentation.text
          : `error: ${error.name ?? error.code}${presentation.text === '' ? '' : `\n${presentation.text}`}`
        turn.toolIds.delete(callId)
        messages[index] = {
          ...existing,
          body,
          running: false,
          collapsed: false,
          ...presentation.bodyCol === undefined ? {} : { bodyCol: presentation.bodyCol },
        }
        return { messages, turn }
      }
      let text = presentation?.text
      if (text === undefined) text = textFromBlocks(event.data.message.content)
      if (text.trim() === '' && existing.body === '' && presenter !== undefined) {
        const fallback = presenter.argsJson(callId)
        if (fallback !== undefined && fallback.trim() !== '') text = fallback
      }
      const lines: string[] = []
      if (text !== '') lines.push(text)
      if (presentation?.exitCode !== undefined) lines.push(`[exit code: ${presentation.exitCode}]`)
      else if (presentation?.signal !== undefined) lines.push(`[killed by signal: ${presentation.signal}]`)
      const rendered = lines.join('\n')
      const body = error === undefined
        ? rendered === '' ? existing.body
          : existing.body === '' ? rendered
            : `${existing.body}\n\n${rendered}`
        : `error: ${error.name ?? error.code}${rendered ? `\n${rendered}` : ''}`
      turn.toolIds.delete(callId)
      messages[index] = { ...existing, body, running: false, collapsed: false }
      return { messages, turn }
    }
    case 'turn/end': {
      for (const id of turn.thinkingIds.values()) {
        const thinkingIndex = messages.findIndex(m => m.id === id)
        if (thinkingIndex < 0) continue
        const thinking = messages[thinkingIndex]
        if (thinking !== undefined && thinking.kind === 'collapsible' && thinking.body === '') {
          messages.splice(thinkingIndex, 1)
        } else if (thinking !== undefined && thinking.kind === 'collapsible') {
          messages[thinkingIndex] = { ...thinking, running: false, collapsed: false }
        }
      }
      for (const message of messages) {
        if (message.kind !== 'collapsible' || !message.running) continue
        message.running = false
        message.body = message.body === '' ? '(no result)' : `${message.body}\n(no result)`
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

function appendThinking(messages: Message[], turn: TurnState, text: string, step: number): { messages: Message[]; turn: TurnState } {
  const id = turn.thinkingIds.get(step)
  if (id === undefined) {
    const fresh = nextId('think')
    turn.thinkingIds.set(step, fresh)
    messages.push({ kind: 'collapsible', id: fresh, label: 'Thinking', body: text, running: true, collapsed: false })
    return { messages, turn }
  }
  const index = messages.findIndex(m => m.id === id)
  if (index >= 0 && messages[index]?.kind === 'collapsible') {
    const target = messages[index]
    if (target !== undefined) target.body += text
  }
  return { messages, turn }
}

function appendAssistant(messages: Message[], turn: TurnState, text: string, step: number): { messages: Message[]; turn: TurnState } {
  const id = turn.assistantIds.get(step)
  if (id === undefined) {
    const fresh = nextId('ai')
    turn.assistantIds.set(step, fresh)
    messages.push({ kind: 'bubble', id: fresh, role: 'assistant', content: text })
    return { messages, turn }
  }
  const index = messages.findIndex(m => m.id === id)
  if (index >= 0 && messages[index]?.kind === 'bubble') {
    const target = messages[index]
    if (target !== undefined) target.content += text
  }
  return { messages, turn }
}
