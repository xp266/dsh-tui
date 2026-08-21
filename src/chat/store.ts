import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Message } from '../model/message.ts'
import { textFromBlocks } from './blocks.ts'
import type { ChatToolPresenter, ToolResultLike } from './bridge.ts'
import type { CollapsibleMessage } from '../model/message.ts'

export interface TurnState {
  thinkingIds: Map<number, string>
  assistantIds: Map<number, string>
  toolIds: Map<string, string>
  pendingText: Map<number, string>
}

export function initialTurnState(): TurnState {
  return { thinkingIds: new Map(), assistantIds: new Map(), toolIds: new Map(), pendingText: new Map() }
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
      if (chunk.type === 'reasoning-delta') return appendChunk(messages, turn, chunk.text, event.data.step, 'thinking')
      if (chunk.type === 'text-delta') return appendChunk(messages, turn, chunk.text, event.data.step, 'assistant')
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
        collapsed: true,
        ...view?.bodyCol === undefined ? {} : { bodyCol: view.bodyCol },
      })
      return { messages, turn }
    }
    case 'tool/result': {
      const callId = event.data.message.content[0]?.toolCallId
      if (callId === undefined) return { messages, turn }
      const id = turn.toolIds.get(callId)
      if (id === undefined) return { messages, turn }
      const collapsible = collapsibleById(messages, id)
      if (collapsible === undefined) return { messages, turn }
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
        updateById(messages, id, message => ({
          ...message,
          body,
          running: false,
          ...presentation.bodyCol === undefined ? {} : { bodyCol: presentation.bodyCol },
        }))
        return { messages, turn }
      }
      let text = presentation?.text
      if (text === undefined) text = textFromBlocks(event.data.message.content)
      if (text.trim() === '' && collapsible.body === '' && presenter !== undefined) {
        const fallback = presenter.argsJson(callId)
        if (fallback !== undefined && fallback.trim() !== '') text = fallback
      }
      const lines: string[] = []
      if (text !== '') lines.push(text)
      if (presentation?.exitCode !== undefined) lines.push(`[exit code: ${presentation.exitCode}]`)
      else if (presentation?.signal !== undefined) lines.push(`[killed by signal: ${presentation.signal}]`)
      const rendered = lines.join('\n')
      const body = error === undefined
        ? rendered === '' ? collapsible.body
          : collapsible.body === '' ? rendered
            : `${collapsible.body}\n\n${rendered}`
        : `error: ${error.name ?? error.code}${rendered ? `\n${rendered}` : ''}`
      turn.toolIds.delete(callId)
      updateById(messages, id, message => ({ ...message, body, running: false }))
      return { messages, turn }
    }
    case 'assistant/message': {
      const id = turn.thinkingIds.get(event.data.step)
      if (id === undefined) return { messages, turn }
      updateById(messages, id, message =>
        message.kind === 'collapsible' ? { ...message, running: false } : message,
      )
      return { messages, turn }
    }
    case 'turn/end': {
      for (const id of turn.thinkingIds.values()) {
        const thinking = collapsibleById(messages, id)
        if (thinking === undefined) continue
        if (thinking.body === '') messages.splice(messages.indexOf(thinking), 1)
        else updateById(messages, id, message => ({ ...message, running: false }))
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

function appendChunk(
  messages: Message[],
  turn: TurnState,
  text: string,
  step: number,
  kind: 'thinking' | 'assistant',
): { messages: Message[]; turn: TurnState } {
  const ids = kind === 'thinking' ? turn.thinkingIds : turn.assistantIds
  const id = ids.get(step)
  if (id === undefined) {
    if (kind === 'assistant') {
      const pending = (turn.pendingText.get(step) ?? '') + text
      if (pending.trim() === '') {
        turn.pendingText.set(step, pending)
        return { messages, turn }
      }
      turn.pendingText.delete(step)
      const fresh = nextId('ai')
      ids.set(step, fresh)
      messages.push({ kind: 'bubble', id: fresh, role: 'assistant', content: pending })
      return { messages, turn }
    }
    const fresh = nextId('think')
    ids.set(step, fresh)
    messages.push({ kind: 'collapsible', id: fresh, label: 'Thinking', body: text, running: true, collapsed: true, thinking: true })
    return { messages, turn }
  }
  if (kind === 'thinking') {
    const index = messages.findIndex(m => m.id === id)
    if (index >= 0 && messages[index]?.kind === 'collapsible') {
      const target = messages[index]
      if (target !== undefined) target.body += text
    }
  } else {
    const index = messages.findIndex(m => m.id === id)
    if (index >= 0 && messages[index]?.kind === 'bubble') {
      const target = messages[index]
      if (target !== undefined) target.content += text
    }
  }
  return { messages, turn }
}

function collapsibleById(messages: Message[], id: string): CollapsibleMessage | undefined {
  const message = messages.find(m => m.id === id)
  return message?.kind === 'collapsible' ? message : undefined
}

function updateById(messages: Message[], id: string, update: (message: Message) => Message): void {
  const index = messages.findIndex(m => m.id === id)
  if (index >= 0) messages[index] = update(messages[index]!)
}
