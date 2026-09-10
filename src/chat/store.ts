import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Message, ToolCardMessage } from '../model/message.ts'
import { reasoningFromBlocks, textFromBlocks, userDisplayText } from './blocks.ts'
import type { ChatToolPresenter, ToolResultLike } from './bridge.ts'
import type { CollapsibleMessage } from '../model/message.ts'
import { glyphs } from '../terminal/glyphs.ts'
import { diffsFromResultMeta, diffLineGroups } from './tool-view.ts'
import { applyChatNodes } from './chat-nodes.ts'

export type AgentPhase = 'awaiting-request' | 'thinking' | 'working'

function errorSummary(cause: { name?: string; code?: string } | undefined): string {
  return `error: ${cause?.name ?? cause?.code ?? 'unknown'}`
}

export function formatThinkingDuration(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs))
  if (total < 1000) return `${total}ms`
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor(total / 60_000) % 60
  const seconds = Math.floor(total / 1000) % 60
  const tenth = Math.floor((total % 1000) / 100)
  const tail = `${seconds}.${tenth}s`
  if (hours > 0) return `${hours}h ${minutes}m ${tail}`
  if (minutes > 0) return `${minutes}m ${tail}`
  return tail
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
  pendingTools: Map<string, string>
  commandNames: Map<string, string>
  compactions: Map<string, string>
  chatNodes: Map<string, string>
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
    pendingTools: new Map(),
    commandNames: new Map(),
    compactions: new Map(),
    chatNodes: new Map(),
    compacting: false,
    running: false,
    phase: 'awaiting-request',
  }
}

/**
 * UI mirror window: the store keeps only the newest HISTORY_WINDOW messages
 * active for layout; evicted messages move to the archive head (text-level
 * objects, never laid out) and come back on demand via load-earlier. The
 * agent seed and session log stay complete. Eviction drops a prefix only —
 * it never crosses a message the running turn still references or is still
 * writing to.
 */
export const HISTORY_WINDOW = 100

/** Synthetic id of the load-earlier bubble row (origin 'earlier'); clicks route to loadEarlier. */
export const EARLIER_MESSAGE_ID = '__earlier__'
export const EARLIER_STEP = 100

export interface WindowSplit {
  active: Message[]
  /** Chronologically ordered messages evicted from the active window. */
  evicted: Message[]
}

export function windowMessages(messages: Message[], turn: TurnState): WindowSplit {
  if (messages.length <= HISTORY_WINDOW) return { active: messages, evicted: [] }
  const protectedIds = new Set<string>()
  for (const map of [turn.thinkingIds, turn.assistantIds, turn.toolIds, turn.pendingTools, turn.commandNames, turn.compactions, turn.chatNodes]) {
    for (const id of map.values()) protectedIds.add(id)
  }
  const isProtected = (message: Message): boolean =>
    protectedIds.has(message.id)
    || ('running' in message && message.running === true)
    || ('streaming' in message && message.streaming === true)
  const overflow = messages.length - HISTORY_WINDOW
  let firstProtected = messages.length
  for (let index = 0; index < overflow; index++) {
    if (isProtected(messages[index]!)) {
      firstProtected = index
      break
    }
  }
  const cut = Math.min(overflow, firstProtected)
  if (cut === 0) return { active: messages, evicted: [] }
  return { active: messages.slice(cut), evicted: messages.slice(0, cut) }
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
  if (applyChatNodes(messages, event, turn)) return { messages, turn, changed: true }
  switch (event.type) {
    case 'user/message': {
      if (event.data.source.kind !== 'user') return { messages, turn, changed: false }
      messages.push({ kind: 'bubble', id: nextId('user'), role: 'user', content: userDisplayText(event.data.content) })
      return { messages, turn, changed: true }
    }
    case 'assistant/chunk': {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta') return appendChunk(messages, turn, chunk.text, event.data.step, 'thinking', event.time)
      if (chunk.type === 'text-delta') return appendChunk(messages, turn, chunk.text, event.data.step, 'assistant', event.time)
      if (chunk.type === 'tool-call-delta') {
        return appendToolDelta(messages, turn, event.data.step, chunk.id, chunk.name, chunk.argumentsDelta, event.time)
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
      const view = presenter?.call(event.data.name, event.data.callId, event.data.arguments)
      const argsBody = view?.body ?? ''
      const id = commitToolPlaceholder(messages, turn, event.data.callId, {
        kind: 'tool-card',
        id: nextId('tool'),
        tool: event.data.name,
        label: view?.label ?? event.data.name,
        argsBody,
        running: true,
        ...view?.bodyCol === undefined ? {} : { bodyCol: view.bodyCol },
        ...view?.diff === undefined ? {} : { diff: view.diff },
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
      const card = toolCardById(messages, id)
      if (card === undefined) return { messages, turn, changed: false }
      const error = event.data.error
      const block = event.data.message.content[0]
      const result: ToolResultLike = {
        content: block?.content ?? [],
        isError: block?.isError === true,
        ...event.data.meta === undefined ? {} : { meta: event.data.meta },
      }
      const presentation = presenter?.result(callId, result)
      let text = presentation?.text
      if (text === undefined) text = textFromBlocks(event.data.message.content)
      // The args JSON is a last-resort body: it only helps when the header
      // carries no summary of its own (a bare tool name), otherwise it just
      // repeats what the header already says.
      if (
        text.trim() === '' && card.argsBody === '' && presentation?.read === undefined
        && card.label === card.tool && presenter !== undefined
      ) {
        const fallback = presenter.argsJson(callId)
        if (fallback !== undefined && fallback.trim() !== '') text = fallback
      }
      const metaDiffs = presentation?.diff === undefined ? diffsFromResultMeta(event.data.meta) : undefined
      const diff = presentation?.diff ?? (metaDiffs === undefined
        ? undefined
        : {
            path: card.diff?.path ?? metaDiffs[0]!.path,
            hunks: diffLineGroups(metaDiffs),
          })
      turn.toolIds.delete(callId)
      const label = presentation?.label
      const read = presentation?.read
      const failed = result.isError === true && error === undefined
      updateById(messages, id, message => {
        if (message.kind !== 'tool-card') return message
        const nextLabel = label === undefined || label === '' || label === message.tool ? message.label : label
        const nextArgs = presentation?.argsBody
        return {
          ...message,
          ...(text === '' ? {} : { resultBody: text }),
          ...(diff === undefined ? {} : { diff }),
          ...(read === undefined ? {} : { read }),
          ...(presentation?.exitCode === undefined ? {} : { exitCode: presentation.exitCode }),
          ...(presentation?.signal === undefined ? {} : { signal: presentation.signal }),
          ...(nextArgs === undefined || nextArgs === message.argsBody ? {} : { argsBody: nextArgs }),
          ...(nextLabel === message.label ? {} : { label: nextLabel }),
          ...(failed ? { failed } : {}),
          running: false,
          ...(error === undefined
            ? (presentation?.bodyCol === undefined ? {} : { bodyCol: presentation.bodyCol })
            : { error: errorSummary(error), bodyCol: undefined }),
        }
      })
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
            message.kind === 'bubble' ? { ...message, content: text, streaming: false } : message,
          )
        } else {
          clearStreamingById(messages, aiId)
        }
      } else if (text !== '') {
        const fresh = nextId('ai')
        turn.assistantIds.set(step, fresh)
        messages.push({ kind: 'bubble', id: fresh, role: 'assistant', content: text })
      }

      const thinkId = turn.thinkingIds.get(step)
      if (thinkId !== undefined) {
        updateById(messages, thinkId, message => {
          if (message.kind !== 'collapsible') return message
          const updates = reasoning === '' ? {} : { body: reasoning }
          if (!message.running) return { ...message, ...updates, streaming: false }
          const duration = message.startedAt === undefined ? Number.NaN : event.time - message.startedAt
          return {
            ...message,
            ...updates,
            running: false,
            streaming: false,
            ...(Number.isFinite(duration) && duration >= 0
              ? { label: `Thought: ${formatThinkingDuration(duration)}` }
              : {}),
          }
        })
      } else if (reasoning !== '') {
        const freshThink = nextId('think')
        turn.thinkingIds.set(step, freshThink)
        const entry: CollapsibleMessage = {
          kind: 'collapsible',
          id: freshThink,
          label: 'Thinking',
          body: reasoning,
          running: false,
          collapsed: true,
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
        if (message.kind === 'tool-card' && message.running) {
          changed = true
          message.running = false
          if (message.resultBody === undefined && message.argsBody.trim() === '') message.argsBody = '(no result)'
          continue
        }
        if (message.kind === 'tool-card' && message.nested !== undefined && message.nested.some(child => child.running)) {
          changed = true
          message.nested = message.nested.map(child => !child.running
            ? child
            : {
                ...child,
                running: false,
                ...(child.resultBody === undefined && child.argsBody.trim() === '' ? { argsBody: '(no result)' } : {}),
              })
          continue
        }
        if ((message.kind === 'custom') && message.running) {
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
        if (message.kind === 'compaction' || !('streaming' in message) || !message.streaming) continue
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
      if ((event.type as string) === 'tool/code-dispatch-start') {
        return reduceCodeDispatch(messages, turn, event, false, presenter)
      }
      if ((event.type as string) === 'tool/code-dispatch') {
        return reduceCodeDispatch(messages, turn, event, true, presenter)
      }
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
        const label = name === '' ? '' : `${name} ${glyphs.separator} `
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
  time: number,
): { messages: Message[]; turn: TurnState; changed: boolean } {
  markRunning(turn, true)
  if (kind === 'thinking') {
    markPhase(turn, 'thinking')
  } else {
    markPhase(turn, 'working')
    finalizeThinking(messages, turn, step, time)
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
      messages.push({ kind: 'bubble', id: fresh, role: 'assistant', content: pending, streaming: true })
      return { messages, turn, changed: true }
    }
    const fresh = nextId('think')
    ids.set(step, fresh)
    messages.push({ kind: 'collapsible', id: fresh, label: 'Thinking', body: text, running: true, collapsed: true, thinking: true, startedAt: time })
    return { messages, turn, changed: true }
  }
  let changed = false
  const index = messages.findIndex(m => m.id === id)
  const target = index >= 0 ? messages[index] : undefined
  if (target !== undefined && text !== '') {
    if (kind === 'thinking' && target.kind === 'collapsible') {
      if (target.running) {
        target.body += text
      } else {
        updateById(messages, id, message => message.kind === 'collapsible'
          ? { ...message, running: true, label: 'Thinking', body: message.body + text }
          : message)
      }
      changed = true
    } else if (kind === 'assistant' && target.kind === 'bubble') {
      target.content += text
      // The streaming flag routes the render through the incremental markdown
      // path; it is cleared by the assistant/message and turn/end handlers.
      target.streaming = true
      changed = true
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
  step: number,
  callId: string,
  name: string | undefined,
  delta: string,
  time: number,
): { messages: Message[]; turn: TurnState; changed: boolean } {
  markRunning(turn, true)
  markPhase(turn, 'working')
  finalizeThinking(messages, turn, step, time)
  if (name === undefined || name === '') return { messages, turn, changed: false }
  const known = turn.pendingTools.has(callId) || turn.toolIds.has(callId)
  if (known) return { messages, turn, changed: false }
  const placeholder: Message = {
    kind: 'tool-card',
    id: nextId('tool'),
    tool: name,
    label: name,
    argsBody: '',
    running: true,
    streaming: true,
  }
  messages.push(placeholder)
  turn.pendingTools.set(callId, placeholder.id)
  return { messages, turn, changed: true }
}

function collapsibleById(messages: Message[], id: string): CollapsibleMessage | undefined {
  const message = messages.find(m => m.id === id)
  return message?.kind === 'collapsible' ? message : undefined
}

function toolCardById(messages: Message[], id: string): ToolCardMessage | undefined {
  const message = messages.find(m => m.id === id)
  return message?.kind === 'tool-card' ? message : undefined
}

function finalizeThinking(messages: Message[], turn: TurnState, step: number, endedAt: number): boolean {
  const id = turn.thinkingIds.get(step)
  if (id === undefined) return false
  const target = collapsibleById(messages, id)
  if (target === undefined || !target.running) return false
  const duration = target.startedAt === undefined ? Number.NaN : endedAt - target.startedAt
  updateById(messages, id, message => message.kind === 'collapsible'
    ? {
        ...message,
        running: false,
        ...(Number.isFinite(duration) && duration >= 0
          ? { label: `Thought: ${formatThinkingDuration(duration)}` }
          : {}),
      }
    : message)
  return true
}

function updateById(messages: Message[], id: string, update: (message: Message) => Message): void {
  const index = messages.findIndex(m => m.id === id)
  if (index >= 0) messages[index] = update(messages[index]!)
}

function clearStreamingById(messages: Message[], id: string): void {
  const index = messages.findIndex(m => m.id === id)
  if (index >= 0) {
    const message = messages[index]!
    if ('streaming' in message && message.streaming === true) messages[index] = { ...message, streaming: false }
  }
}

interface CodeDispatchData {
  rootCallId: string
  parentCallId: string
  subCallId: string
  name: string
  arguments: unknown
  isError?: boolean
  content?: Array<{ type: string; text?: string }>
}

/**
 * Code-mode sub-dispatches render as child cards under the root `run_code`
 * bubble: the start event commits a running placeholder, the settle event
 * pairs with it by `subCallId`. The root card is the render anchor, so a
 * settle whose start fell outside the turn still attaches to it.
 */
function reduceCodeDispatch(
  messages: Message[],
  turn: TurnState,
  event: SessionEvent,
  settled: boolean,
  presenter?: ChatToolPresenter,
): { messages: Message[]; turn: TurnState; changed: boolean } {
  const data = (event.data as unknown as CodeDispatchData)
  const rootId = turn.toolIds.get(String(data.rootCallId))
  const argsText = stringifyDispatchArgs(data.arguments)
  if (!settled) {
    const view = presenter?.call(data.name, String(data.subCallId), argsText)
    const child: ToolCardMessage = {
      kind: 'tool-card',
      id: nextId('tool'),
      tool: data.name,
      label: view?.label ?? data.name,
      argsBody: view?.body ?? '',
      running: true,
      ...view?.bodyCol === undefined ? {} : { bodyCol: view.bodyCol },
      ...view?.diff === undefined ? {} : { diff: view.diff },
    }
    if (rootId !== undefined) {
      updateById(messages, rootId, message => message.kind === 'tool-card'
        ? { ...message, nested: [...message.nested ?? [], child] }
        : message)
    } else {
      messages.push(child)
    }
    turn.toolIds.set(String(data.subCallId), child.id)
    markRunning(turn, true)
    return { messages, turn, changed: true }
  }
  const childId = turn.toolIds.get(String(data.subCallId))
  turn.toolIds.delete(String(data.subCallId))
  const childResult = textFromBlocks((data.content ?? []) as Parameters<typeof textFromBlocks>[0])
  const settle = (card: ToolCardMessage): ToolCardMessage => ({
    ...card,
    running: false,
    ...(childResult === '' ? {} : { resultBody: childResult }),
    ...(data.isError === true ? { failed: true } : {}),
  })
  let changed = false
  if (childId !== undefined) {
    const at = messages.findIndex(message => message.id === childId)
    if (at >= 0 && messages[at]!.kind === 'tool-card') {
      messages[at] = settle(messages[at] as ToolCardMessage)
    } else if (rootId !== undefined) {
      updateById(messages, rootId, message => message.kind === 'tool-card'
        ? { ...message, nested: (message.nested ?? []).map(child => child.id === childId ? settle(child) : child) }
        : message)
    }
    changed = true
  } else {
    const child = settle({
      kind: 'tool-card',
      id: nextId('tool'),
      tool: data.name,
      label: data.name,
      argsBody: '',
      running: false,
    })
    if (rootId !== undefined) {
      updateById(messages, rootId, message => message.kind === 'tool-card'
        ? { ...message, nested: [...message.nested ?? [], child] }
        : message)
    } else {
      messages.push(child)
    }
    changed = true
  }
  return { messages, turn, changed }
}

function stringifyDispatchArgs(args: unknown): string {
  if (args === undefined || args === null) return ''
  try {
    return JSON.stringify(args) ?? ''
  } catch {
    // Cyclic or unserializable dispatch args degrade to an empty body.
    return ''
  }
}
