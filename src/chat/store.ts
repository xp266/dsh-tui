import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Message } from '../model/message.ts'
import { reasoningFromBlocks, textFromBlocks } from './blocks.ts'
import type { ChatToolPresenter, ToolResultLike } from './bridge.ts'
import type { CollapsibleMessage } from '../model/message.ts'
import {
  ASK_USER_TOOL_NAME,
  formatAskUserBubble,
  formatAskUserError,
  parseAskAnswers,
  parseAskQuestions,
} from './question-view.ts'
import {
  TODO_HANG_COLS,
  TODO_TOOL_NAME,
  formatTodoBubble,
  parseTodoArgs,
  parseTodoResult,
} from './todo-view.ts'

export type AgentPhase = 'awaiting-request' | 'thinking' | 'working'

export interface AgentActivity {
  running: boolean
  phase: AgentPhase
}

export interface TurnState {
  thinkingIds: Map<number, string>
  assistantIds: Map<number, string>
  toolIds: Map<string, string>
  pendingText: Map<number, string>
  askArgs: Map<string, unknown>
  running: boolean
  phase: AgentPhase
}

export function initialTurnState(): TurnState {
  return {
    thinkingIds: new Map(),
    assistantIds: new Map(),
    toolIds: new Map(),
    pendingText: new Map(),
    askArgs: new Map(),
    running: false,
    phase: 'awaiting-request',
  }
}

function markRunning(turn: TurnState, running: boolean): void {
  turn.running = running
}

function markPhase(turn: TurnState, phase: AgentPhase): void {
  turn.phase = phase
}

let messageCounter = 0

function nextId(prefix: string): string {
  messageCounter += 1
  return `${prefix}-${messageCounter}`
}

const CHROME_EVENTS = new Set(['permission/preset', 'sandbox/mode', 'approval/policy'])

function dropStepMessages(messages: Message[], turn: TurnState, step: number): boolean {
  let removed = false
  for (const map of [turn.assistantIds, turn.thinkingIds]) {
    const id = map.get(step)
    if (id === undefined) continue
    map.delete(step)
    const at = messages.findIndex(m => m.id === id)
    if (at >= 0) {
      messages.splice(at, 1)
      removed = true
    }
  }
  turn.pendingText.delete(step)
  return removed
}

export function reduceChatEvent(
  messages: Message[],
  event: SessionEvent,
  turn: TurnState,
  presenter?: ChatToolPresenter,
): { messages: Message[]; turn: TurnState; changed: boolean } {
  switch (event.type) {
    case 'user/message': {
      if (event.data.source.kind !== 'user') return { messages, turn, changed: false }
      messages.push({ kind: 'bubble', id: nextId('user'), role: 'user', content: textFromBlocks(event.data.content) })
      return { messages, turn, changed: true }
    }
    case 'assistant/chunk': {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') return appendChunk(messages, turn, chunk.text, event.data.step, 'thinking')
      if (chunk.type === 'text-delta') return appendChunk(messages, turn, chunk.text, event.data.step, 'assistant')
      return { messages, turn, changed: false }
    }
    case 'turn/start': {
      markRunning(turn, true)
      markPhase(turn, 'awaiting-request')
      return { messages, turn, changed: true }
    }
    case 'tool/call': {
      if (event.data.name === ASK_USER_TOOL_NAME) {
        const id = nextId('ask')
        turn.toolIds.set(event.data.callId, id)
        try {
          turn.askArgs.set(event.data.callId, JSON.parse(event.data.arguments))
        } catch {}
        messages.push({ kind: 'bubble', id, role: 'assistant', content: ASK_USER_TOOL_NAME, variant: 'ask-user' })
        markRunning(turn, true)
        markPhase(turn, 'working')
        return { messages, turn, changed: true }
      }
      if (event.data.name === TODO_TOOL_NAME) {
        const id = nextId('todo')
        turn.toolIds.set(event.data.callId, id)
        let args: unknown
        try {
          args = JSON.parse(event.data.arguments)
        } catch {}
        const items = parseTodoArgs(args)
        messages.push({
          kind: 'bubble',
          id,
          role: 'assistant',
          content: items.length > 0 ? formatTodoBubble(items) : TODO_TOOL_NAME,
          variant: 'todo',
          hang: TODO_HANG_COLS,
        })
        markRunning(turn, true)
        markPhase(turn, 'working')
        return { messages, turn, changed: true }
      }
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
      markRunning(turn, true)
      markPhase(turn, 'working')
      return { messages, turn, changed: true }
    }
    case 'tool/result': {
      const callId = event.data.message.content[0]?.toolCallId
      if (callId === undefined) return { messages, turn, changed: false }
      const id = turn.toolIds.get(callId)
      if (id === undefined) return { messages, turn, changed: false }
      const target = messageById(messages, id)
      if (target?.kind === 'bubble' && target.variant === 'ask-user') {
        return settleAskUserBubble(messages, turn, id, callId, event)
      }
      if (target?.kind === 'bubble' && target.variant === 'todo') {
        turn.toolIds.delete(callId)
        const items = parseTodoResult(textFromBlocks(event.data.message.content).trim())
        if (items.length > 0) {
          updateById(messages, id, message => message.kind === 'bubble'
            ? { ...message, content: formatTodoBubble(items) }
            : message)
        }
        return { messages, turn, changed: true }
      }
      const collapsible = collapsibleById(messages, id)
      if (collapsible === undefined) return { messages, turn, changed: false }
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
          bodyCol: error === undefined ? presentation.bodyCol : undefined,
        }))
        markPhase(turn, 'awaiting-request')
        return { messages, turn, changed: true }
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
      updateById(messages, id, message => ({
        ...message,
        body,
        running: false,
        ...(error === undefined ? {} : { bodyCol: undefined }),
      }))
      markPhase(turn, 'awaiting-request')
      return { messages, turn, changed: true }
    }
    case 'assistant/message': {
      const step = event.data.step
      const blocks = event.data.message.content
      const text = textFromBlocks(blocks)
      const reasoning = reasoningFromBlocks(blocks)

      const aiId = turn.assistantIds.get(step)
      if (aiId !== undefined) {
        if (text !== '') {
          updateById(messages, aiId, message =>
            message.kind === 'bubble' ? { ...message, content: text } : message,
          )
        }
      } else if (text !== '') {
        const fresh = nextId('ai')
        turn.assistantIds.set(step, fresh)
        messages.push({ kind: 'bubble', id: fresh, role: 'assistant', content: text })
      }

      const thinkId = turn.thinkingIds.get(step)
      if (thinkId !== undefined) {
        updateById(messages, thinkId, message => message.kind === 'collapsible'
          ? { ...message, running: false, ...(reasoning === '' ? {} : { body: reasoning }) }
          : message,
        )
      } else if (reasoning !== '') {
        const freshThink = nextId('think')
        turn.thinkingIds.set(step, freshThink)
        const entry: CollapsibleMessage = {
          kind: 'collapsible',
          id: freshThink,
          label: 'Thinking',
          body: reasoning,
          running: false,
          collapsed: false,
          thinking: true,
        }
        const anchor = turn.assistantIds.get(step)
        const at = anchor === undefined ? -1 : messages.findIndex(m => m.id === anchor)
        if (at >= 0) messages.splice(at, 0, entry)
        else messages.push(entry)
      }
      return { messages, turn, changed: true }
    }
    case 'turn/end': {
      let changed = false
      for (const id of turn.thinkingIds.values()) {
        const thinking = collapsibleById(messages, id)
        if (thinking === undefined) continue
        changed = true
        if (thinking.body === '') messages.splice(messages.indexOf(thinking), 1)
        else updateById(messages, id, message => ({ ...message, running: false }))
      }
      for (const message of messages) {
        if (message.kind !== 'collapsible' || !message.running) continue
        changed = true
        message.running = false
        message.body = message.body === '' ? '(no result)' : `${message.body}\n(no result)`
      }
      const reason = event.data.reason
      if (reason.kind === 'error') {
        changed = true
        messages.push({ kind: 'bubble', id: nextId('error'), role: 'error', content: `error: ${reason.error.message}` })
      }
      return { messages, turn: initialTurnState(), changed }
    }
    default: {
      if ((event.type as string) === 'llm/retry-started') {
        const changed = dropStepMessages(messages, turn, (event.data as { step: number }).step)
        markRunning(turn, true)
        return { messages, turn, changed }
      }
      return { messages, turn, changed: CHROME_EVENTS.has(event.type) }
    }
  }
}

function appendChunk(
  messages: Message[],
  turn: TurnState,
  text: string,
  step: number,
  kind: 'thinking' | 'assistant',
): { messages: Message[]; turn: TurnState; changed: boolean } {
  markRunning(turn, true)
  if (kind === 'thinking') {
    markPhase(turn, 'thinking')
  } else {
    markPhase(turn, 'working')
  }
  const ids = kind === 'thinking' ? turn.thinkingIds : turn.assistantIds
  const id = ids.get(step)
  if (id === undefined) {
    if (kind === 'assistant') {
      const pending = (turn.pendingText.get(step) ?? '') + text
      if (pending.trim() === '') {
        turn.pendingText.set(step, pending)
        return { messages, turn, changed: false }
      }
      turn.pendingText.delete(step)
      const fresh = nextId('ai')
      ids.set(step, fresh)
      messages.push({ kind: 'bubble', id: fresh, role: 'assistant', content: pending })
      return { messages, turn, changed: true }
    }
    const fresh = nextId('think')
    ids.set(step, fresh)
    messages.push({ kind: 'collapsible', id: fresh, label: 'Thinking', body: text, running: true, collapsed: false, thinking: true })
    return { messages, turn, changed: true }
  }
  let changed = false
  if (kind === 'thinking') {
    const index = messages.findIndex(m => m.id === id)
    if (index >= 0 && messages[index]?.kind === 'collapsible') {
      const target = messages[index]
      if (target !== undefined && text !== '') {
        target.body += text
        changed = true
      }
    }
  } else {
    const index = messages.findIndex(m => m.id === id)
    if (index >= 0 && messages[index]?.kind === 'bubble') {
      const target = messages[index]
      if (target !== undefined && text !== '') {
        target.content += text
        changed = true
      }
    }
  }
  return { messages, turn, changed }
}

function collapsibleById(messages: Message[], id: string): CollapsibleMessage | undefined {
  const message = messages.find(m => m.id === id)
  return message?.kind === 'collapsible' ? message : undefined
}

function messageById(messages: Message[], id: string): Message | undefined {
  return messages.find(m => m.id === id)
}

function settleAskUserBubble(
  messages: Message[],
  turn: TurnState,
  id: string,
  callId: string,
  event: Extract<SessionEvent, { type: 'tool/result' }>,
): { messages: Message[]; turn: TurnState; changed: boolean } {
  const error = event.data.error
  const block = event.data.message.content[0]
  const failed = error !== undefined || block?.isError === true
  const resultText = textFromBlocks(event.data.message.content).trim()
  let content = ASK_USER_TOOL_NAME
  if (failed) {
    content = formatAskUserError(resultText !== ''
      ? resultText
      : `error: ${error?.name ?? error?.code ?? 'unknown error'}`)
  } else {
    const questions = parseAskQuestions(turn.askArgs.get(callId))
    if (questions.length > 0) content = formatAskUserBubble(questions, parseAskAnswers(resultText))
  }
  turn.toolIds.delete(callId)
  turn.askArgs.delete(callId)
  updateById(messages, id, message => message.kind === 'bubble' ? { ...message, content } : message)
  return { messages, turn, changed: true }
}

function updateById(messages: Message[], id: string, update: (message: Message) => Message): void {
  const index = messages.findIndex(m => m.id === id)
  if (index >= 0) messages[index] = update(messages[index]!)
}
