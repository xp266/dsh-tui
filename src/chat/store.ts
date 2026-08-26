import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { readFileSync } from 'node:fs'
import type { Message, PlanMessage, ToolDiffMessage } from '../model/message.ts'
import { reasoningFromBlocks, textFromBlocks } from './blocks.ts'
import type { ChatToolPresenter, ToolResultLike } from './bridge.ts'
import { DIFF_TOOL_NAMES } from './bridge.ts'
import type { CollapsibleMessage } from '../model/message.ts'
import { extractPartialJsonFields } from './partial-json.ts'
import { diffCallFromArgs, diffGroupsFromTexts, diffsFromResultMeta, diffLineGroups, flattenText, truncateSummary } from './tool-view.ts'
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

export interface ReduceOptions {
  readFile?: (path: string) => string | null
}

function defaultReadFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export interface AgentActivity {
  running: boolean
  phase: AgentPhase
  compacting: boolean
}

export interface TurnState {
  thinkingIds: Map<number, string>
  assistantIds: Map<number, string>
  toolIds: Map<string, string>
  pendingText: Map<number, string>
  askArgs: Map<string, unknown>
  pendingTools: Map<string, string>
  pendingArgs: Map<string, string>
  commandNames: Map<string, string>
  compactions: Map<string, string>
  compacting: boolean
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
    pendingTools: new Map(),
    pendingArgs: new Map(),
    commandNames: new Map(),
    compactions: new Map(),
    compacting: false,
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

export const PLAN_TOOL_NAME = 'exit_plan_mode'

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
  options: ReduceOptions = {},
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
      if (chunk.type === 'tool-call-delta') {
        return appendToolDelta(messages, turn, chunk.id, chunk.name, chunk.argumentsDelta)
      }
      return { messages, turn, changed: false }
    }
    case 'turn/start': {
      markRunning(turn, true)
      markPhase(turn, 'awaiting-request')
      turn.thinkingIds.clear()
      turn.assistantIds.clear()
      turn.pendingText.clear()
      return { messages, turn, changed: true }
    }
    case 'tool/call': {
      if (event.data.name === ASK_USER_TOOL_NAME) {
        const id = commitToolPlaceholder(messages, turn, event.data.callId, {
          kind: 'bubble',
          id: nextId('ask'),
          role: 'assistant',
          content: ASK_USER_TOOL_NAME,
          variant: 'ask-user',
        })
        turn.toolIds.set(event.data.callId, id)
        try {
          turn.askArgs.set(event.data.callId, JSON.parse(event.data.arguments))
        } catch {}
        markRunning(turn, true)
        markPhase(turn, 'working')
        return { messages, turn, changed: true }
      }
      if (event.data.name === TODO_TOOL_NAME) {
        let args: unknown
        try {
          args = JSON.parse(event.data.arguments)
        } catch {}
        const items = parseTodoArgs(args)
        const id = commitToolPlaceholder(messages, turn, event.data.callId, {
          kind: 'bubble',
          id: nextId('todo'),
          role: 'assistant',
          content: items.length > 0 ? formatTodoBubble(items) : TODO_TOOL_NAME,
          variant: 'todo',
          hang: TODO_HANG_COLS,
        })
        turn.toolIds.set(event.data.callId, id)
        markRunning(turn, true)
        markPhase(turn, 'working')
        return { messages, turn, changed: true }
      }
      if (event.data.name === PLAN_TOOL_NAME) {
        let args: unknown
        try {
          args = JSON.parse(event.data.arguments)
        } catch {}
        const record = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {}
        const plan = typeof record.plan === 'string' ? record.plan : ''
        const id = commitToolPlaceholder(messages, turn, event.data.callId, {
          kind: 'plan',
          id: nextId('plan'),
          body: plan,
          running: true,
        })
        turn.toolIds.set(event.data.callId, id)
        turn.pendingArgs.delete(event.data.callId)
        markRunning(turn, true)
        markPhase(turn, 'working')
        return { messages, turn, changed: true }
      }
      if (DIFF_TOOL_NAMES.has(event.data.name)) {
        let args: unknown
        try {
          args = JSON.parse(event.data.arguments)
        } catch {}
        const view = presenter?.call(event.data.name, event.data.callId, event.data.arguments)
        let diff = view?.diff ?? diffCallFromArgs(event.data.name, args)
        if (event.data.name === 'write') {
          const record = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {}
          const content = typeof record.content === 'string' ? record.content : ''
          const filePath = typeof record.file_path === 'string' ? record.file_path : diff.path
          const oldText = (options.readFile ?? defaultReadFile)(filePath)
          if (oldText !== null) {
            diff = { path: diff.path !== '' ? diff.path : filePath, hunks: diffGroupsFromTexts(oldText, content) }
          }
        }
        const id = commitToolPlaceholder(messages, turn, event.data.callId, {
          kind: 'tool-diff',
          id: nextId('tdiff'),
          tool: event.data.name,
          path: diff.path,
          hunks: diff.hunks,
          running: true,
        })
        turn.toolIds.set(event.data.callId, id)
        turn.pendingArgs.delete(event.data.callId)
        markRunning(turn, true)
        markPhase(turn, 'working')
        return { messages, turn, changed: true }
      }
      const view = presenter?.call(event.data.name, event.data.callId, event.data.arguments)
      const id = commitToolPlaceholder(messages, turn, event.data.callId, {
        kind: 'collapsible',
        id: nextId('tool'),
        label: view?.label ?? event.data.name,
        body: view?.body ?? '',
        running: true,
        collapsed: true,
        ...view?.bodyCol === undefined ? {} : { bodyCol: view.bodyCol },
      })
      turn.toolIds.set(event.data.callId, id)
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
      if (target?.kind === 'tool-diff') {
        turn.toolIds.delete(callId)
        turn.pendingArgs.delete(callId)
        markPhase(turn, 'awaiting-request')
        const error = event.data.error
        const failed = error !== undefined || event.data.message.content[0]?.isError === true
        if (failed) {
          const detail = truncateSummary(flattenText(textFromBlocks(event.data.message.content)))
          updateById(messages, id, message => message.kind === 'tool-diff'
            ? {
                ...message,
                streaming: false,
                running: false,
                error: `error: ${error?.name ?? error?.code ?? 'unknown'}${detail === '' ? '' : ` ${detail}`}`,
              }
            : message)
          return { messages, turn, changed: true }
        }
        const result: ToolResultLike = {
          content: event.data.message.content[0]?.content ?? [],
          isError: false,
          ...event.data.meta === undefined ? {} : { meta: event.data.meta },
        }
        const presentation = presenter?.result(callId, result)
        const metaDiffs = presentation?.diff === undefined ? diffsFromResultMeta(event.data.meta) : undefined
        const diff = presentation?.diff ?? (metaDiffs === undefined
          ? undefined
          : {
              path: target.path !== '' ? target.path : metaDiffs[0]!.path,
              hunks: diffLineGroups(metaDiffs),
            })
        updateById(messages, id, message => message.kind === 'tool-diff'
          ? {
              ...message,
              streaming: false,
              running: false,
              ...(diff === undefined ? {} : { path: diff.path, hunks: diff.hunks }),
            }
          : message)
        return { messages, turn, changed: true }
      }
      if (target?.kind === 'plan') {
        turn.toolIds.delete(callId)
        turn.pendingArgs.delete(callId)
        markPhase(turn, 'awaiting-request')
        const error = event.data.error
        const failed = error !== undefined || event.data.message.content[0]?.isError === true
        const detail = failed ? truncateSummary(flattenText(textFromBlocks(event.data.message.content))) : ''
        updateById(messages, id, message => message.kind === 'plan'
          ? {
              ...message,
              running: false,
              ...(failed && error !== undefined ? { error: `${error.name ?? error.code}${detail === '' ? '' : ` ${detail}`}` } : {}),
            }
          : message)
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
        if (message.kind === 'collapsible' && message.running) {
          changed = true
          message.running = false
          message.body = message.body === '' ? '(no result)' : `${message.body}\n(no result)`
          continue
        }
        if ((message.kind === 'tool-diff' || message.kind === 'plan') && message.running) {
          changed = true
          message.running = false
        }
      }
      for (const [, pendingId] of turn.pendingTools) {
        const index = messages.findIndex(message => message.id === pendingId)
        if (index >= 0) {
          messages.splice(index, 1)
          changed = true
        }
      }
      turn.pendingTools.clear()
      for (const message of messages) {
        if (message.kind === 'compaction' || !message.streaming) continue
        changed = true
        message.streaming = false
      }
      const reason = event.data.reason
      if (reason.kind === 'error') {
        changed = true
        messages.push({ kind: 'bubble', id: nextId('error'), role: 'error', content: `error: ${reason.error.message}` })
      }
      return { messages, turn: { ...initialTurnState(), compactions: turn.compactions, compacting: turn.compacting }, changed }
    }
    default: {
      if ((event.type as string) === 'command/run') {
        const data = (event.data as unknown as { commandId: string; name: string })
        turn.commandNames.set(data.commandId, data.name)
        return { messages, turn, changed: false }
      }
      if ((event.type as string) === 'command/done') {
        const data = (event.data as unknown as { commandId: string; kind: "success" | "error"; text?: string })
        const name = turn.commandNames.get(data.commandId) ?? ''
        turn.commandNames.delete(data.commandId)
        if (name === 'compact' && data.kind !== 'error') return { messages, turn, changed: false }
        const text = data.text ?? ''
        if (data.kind !== 'error' && text.trim() === '') return { messages, turn, changed: false }
        const label = name === '' ? '' : `${name} · `
        messages.push({
          kind: 'bubble',
          id: nextId('cmd'),
          role: data.kind === 'error' ? 'error' : 'assistant',
          content: data.kind === 'error' && text.trim() === '' ? `${name} failed` : `${label}${text}`,
          origin: 'command',
        })
        return { messages, turn, changed: true }
      }
      if ((event.type as string) === 'llm/retry-started') {
        const changed = dropStepMessages(messages, turn, (event.data as { step: number }).step)
        markRunning(turn, true)
        return { messages, turn, changed }
      }
      if ((event.type as string) === 'compaction/start') {
        const data = (event.data as unknown as { compactionId: string })
        const id = nextId('cmp')
        turn.compactions.set(data.compactionId, id)
        turn.compacting = true
        messages.push({ kind: 'compaction', id, compactionId: data.compactionId, running: true, summary: '' })
        return { messages, turn, changed: true }
      }
      if ((event.type as string) === 'compaction/summary') {
        const data = (event.data as unknown as {
          compactionId: string
          summary: Array<{ type: string; text?: string }>
        })
        const id = turn.compactions.get(data.compactionId)
        if (id === undefined) return { messages, turn, changed: false }
        updateById(messages, id, message => message.kind === 'compaction'
          ? { ...message, summary: textFromBlocks(data.summary as Parameters<typeof textFromBlocks>[0]) }
          : message)
        return { messages, turn, changed: true }
      }
      if ((event.type as string) === 'compaction/end') {
        const data = (event.data as unknown as { compactionId: string; error?: string })
        const id = turn.compactions.get(data.compactionId)
        if (id === undefined) return { messages, turn, changed: false }
        turn.compactions.delete(data.compactionId)
        turn.compacting = false
        updateById(messages, id, message => message.kind === 'compaction'
          ? { ...message, running: false, ...(data.error === undefined ? {} : { error: data.error }) }
          : message)
        return { messages, turn, changed: true }
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

function commitToolPlaceholder(messages: Message[], turn: TurnState, callId: string, real: Message): string {
  const committed = { ...real, streaming: false }
  const pendingId = turn.pendingTools.get(callId)
  turn.pendingTools.delete(callId)
  if (pendingId === undefined) {
    messages.push(committed)
    return committed.id
  }
  const index = messages.findIndex(message => message.id === pendingId)
  if (index >= 0) {
    messages[index] = { ...committed, id: pendingId }
    return pendingId
  }
  messages.push(committed)
  return committed.id
}

function appendToolDelta(
  messages: Message[],
  turn: TurnState,
  callId: string,
  name: string | undefined,
  delta: string,
): { messages: Message[]; turn: TurnState; changed: boolean } {
  markRunning(turn, true)
  markPhase(turn, 'working')
  if (name === undefined || name === '') return { messages, turn, changed: false }
  const known = turn.pendingTools.has(callId) || turn.toolIds.has(callId)
  if (name === PLAN_TOOL_NAME) {
    let changed = false
    if (!known) {
      const placeholder: PlanMessage = { kind: 'plan', id: nextId('plan'), body: '', streaming: true }
      messages.push(placeholder)
      turn.pendingTools.set(callId, placeholder.id)
      changed = true
    }
    if (delta !== '') {
      turn.pendingArgs.set(callId, (turn.pendingArgs.get(callId) ?? '') + delta)
      const plan = extractPartialJsonFields(turn.pendingArgs.get(callId) ?? '').plan?.value ?? ''
      const id = turn.pendingTools.get(callId)
      const target = id === undefined ? undefined : messages.find(message => message.id === id)
      if (target?.kind === 'plan' && target.body !== plan) {
        updateById(messages, id!, message => message.kind === 'plan' ? { ...message, body: plan } : message)
        changed = true
      }
    }
    return { messages, turn, changed }
  }
  if (DIFF_TOOL_NAMES.has(name)) {
    let changed = false
    if (!known) {
      const placeholder: ToolDiffMessage = {
        kind: 'tool-diff',
        id: nextId('tdiff'),
        tool: name,
        path: '',
        hunks: [],
        streaming: true,
      }
      messages.push(placeholder)
      turn.pendingTools.set(callId, placeholder.id)
      changed = true
    }
    if (delta !== '') {
      turn.pendingArgs.set(callId, (turn.pendingArgs.get(callId) ?? '') + delta)
      const fields = extractPartialJsonFields(turn.pendingArgs.get(callId) ?? '')
      const path = fields.file_path?.value
      const streamText = name === 'write' ? fields.content?.value : undefined
      const id = turn.pendingTools.get(callId)
      const target = id === undefined ? undefined : messages.find(message => message.id === id)
      if (target?.kind === 'tool-diff') {
        const pathChanged = path !== undefined && path !== '' && target.path !== path
        const textChanged = streamText !== undefined && target.streamText !== streamText
        if (pathChanged || textChanged) {
          updateById(messages, id!, message => message.kind === 'tool-diff'
            ? { ...message, ...(pathChanged ? { path: path! } : {}), ...(streamText === undefined ? {} : { streamText }) }
            : message)
          changed = true
        }
      }
    }
    return { messages, turn, changed }
  }
  if (known) return { messages, turn, changed: false }
  let placeholder: Message
  if (name === ASK_USER_TOOL_NAME) {
    placeholder = { kind: 'bubble', id: nextId('ask'), role: 'assistant', content: name, variant: 'ask-user', streaming: true }
  } else if (name === TODO_TOOL_NAME) {
    placeholder = { kind: 'bubble', id: nextId('todo'), role: 'assistant', content: name, variant: 'todo', hang: TODO_HANG_COLS, streaming: true }
  } else {
    placeholder = { kind: 'collapsible', id: nextId('tool'), label: name, body: '', running: true, collapsed: true, streaming: true }
  }
  messages.push(placeholder)
  turn.pendingTools.set(callId, placeholder.id)
  return { messages, turn, changed: true }
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

function indexOf(messages: Message[], id: string): number {
  return messages.findIndex(message => message.id === id)
}
