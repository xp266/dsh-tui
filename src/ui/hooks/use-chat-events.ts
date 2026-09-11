import type {} from '@deepseek-ai/dsh-tool-todo'
import { useEffect, useRef, useState } from 'react'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { ChatBridge, ChatToolPresenter, RegistryCommand } from '../../chat/bridge.ts'
import { initialTurnState, reduceChatEvent, reduceStreamFrame, EARLIER_STEP } from '../../chat/store.ts'
import { nextRetryStatus } from '../../chat/retry-status.ts'
import type { RetryStatus } from '../../chat/retry-status.ts'
import type { AgentActivity } from '../../chat/store.ts'
import { normalizeTodos } from '../../chat/todo-view.ts'
import type { TodoItemLike } from '../../chat/todo-view.ts'
import type { Message } from '../../model/message.ts'
import { EARLIER_MESSAGE_ID } from '../../chat/store.ts'
import { rowCount } from '../message/layout.ts'
import { windowMessages } from '../../chat/store.ts'
import { releaseFields, hasFieldSlots, fieldCharsOf, releaseMissingChars } from '../../core/fields.ts'

const FRAME_MS = 33

const IDLE_ACTIVITY: AgentActivity = { running: false, phase: 'awaiting-request', compacting: false }
const NO_TODOS: TodoItemLike[] = []

/**
 * One item of the frame-loop queue: a durable session event or a live
 * assistant-stream frame. Neither channel is ordered against the other on its
 * own, so both push into this one queue and the loop consumes them in
 * arrival order — a text delta that arrives before its step's durable
 * `assistant/message` must render before it, and the settlement must clear it.
 */
type PendingItem =
  | { kind: 'event'; event: SessionEvent }
  | { kind: 'stream'; frame: AssistantStreamFrame }

function todosKey(todos: readonly TodoItemLike[]): string {
  return todos.map(item => `${item.status}:${item.content}`).join('\n')
}

/** True when any bubble content still carries the field char. */
function containsChar(messages: readonly Message[], char: string): boolean {
  for (const message of messages) {
    if (message.kind === 'bubble' && message.content.includes(char)) return true
  }
  return false
}

export interface ChatEvents {
  messages: Message[]
  /** Messages evicted from the active window, available for load-earlier. */
  archiveCount: number
  /** Prepend EARLIER_STEP archived messages; returns the row-height delta for scroll anchoring. */
  loadEarlier(): number
  modelName: string
  setModelName(name: string): void
  updateMessages(fn: (messages: Message[]) => Message[]): void
  resetChat(): void
  activity: AgentActivity
  /**
   * Monotonic count of finished model steps for the active agent. A pending
   * interrupt delivery releases at the next boundary after it was armed.
   */
  stepBoundary: number
  todos: TodoItemLike[]
  retryStatus?: RetryStatus
  streamedChars: number
  registryCommands: readonly RegistryCommand[]
}

export function useChatEvents(bridge: ChatBridge | undefined, dialogOpen: boolean, columns: number): ChatEvents {
  const [messages, setMessages] = useState<Message[]>([])
  const [archiveCount, setArchiveCount] = useState(0)
  const [modelName, setModelName] = useState('')
  const [activity, setActivity] = useState<AgentActivity>(IDLE_ACTIVITY)
  const [todos, setTodos] = useState<TodoItemLike[]>(NO_TODOS)
  const [retryStatus, setRetryStatus] = useState<RetryStatus | undefined>(undefined)
  const [streamedChars, setStreamedChars] = useState(0)
  const [stepBoundary, setStepBoundary] = useState(0)
  const [registryCommands, setRegistryCommands] = useState<readonly RegistryCommand[]>([])
  const streamedCharsRef = useRef(0)
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const chatStateRef = useRef<{ messages: Message[]; archive: Message[]; turn: ReturnType<typeof initialTurnState> }>({
    messages: [],
    archive: [],
    turn: initialTurnState(),
  })
  const pendingItemsRef = useRef<PendingItem[]>([])
  const retryStatusRef = useRef<RetryStatus | undefined>(undefined)
  const presenterRef = useRef<ChatToolPresenter | undefined>(undefined)
  const dialogOpenRef = useRef(false)
  dialogOpenRef.current = dialogOpen
  // The load-earlier row is render-level only: a synthetic user bubble kept
  // out of the store, so reduce/window/selection math never sees it.
  const withEarlierRow = (list: Message[], count: number): Message[] =>
    count > 0 ? [{ kind: 'bubble', id: EARLIER_MESSAGE_ID, role: 'user', origin: 'earlier', content: `↑ ${count} earlier messages · click to load` }, ...list] : list
  const publish = (list: Message[], count: number): Message[] => {
    // A fresh array per publish is load-bearing: the store mutates its list in
    // place, and both React state equality and the row-index cache key on
    // array identity, so reusing the reference would freeze the rendered
    // conversation at its first snapshot.
    const next = withEarlierRow([...list], count)
    setMessages(next)
    return next
  }
  useEffect(() => {
    presenterRef.current = bridge?.toolPresenter
    if (bridge === undefined) {
      setRegistryCommands([])
      return
    }
    setRegistryCommands(bridge.listRegistryCommands())
    return bridge.onRegistryChanged(() => setRegistryCommands(bridge.listRegistryCommands()))
  }, [bridge])
  useEffect(() => {
    if (!bridge) return
    const offEvents = bridge.subscribe(event => {
      pendingItemsRef.current.push({ kind: 'event', event })
    })
    const offStream = bridge.subscribeStream(frame => {
      pendingItemsRef.current.push({ kind: 'stream', frame })
    })
    return () => {
      offEvents()
      offStream()
    }
  }, [bridge])
  useEffect(() => {
    const timer = setInterval(() => {
      if (dialogOpenRef.current) return
      const items = pendingItemsRef.current
      if (items.length === 0) return
      pendingItemsRef.current = []
      let state = chatStateRef.current
      let dirty = false
      let archiveDirty = false
      let latestTodos: TodoItemLike[] | undefined
      let retry: RetryStatus | undefined = retryStatusRef.current
      let retryDirty = false
      let stepEnded = 0
      for (const item of items) {
        if (item.kind === 'stream') {
          const next = reduceStreamFrame(state.messages, item.frame, state.turn)
          dirty = dirty || next.changed
          state = { ...state, messages: next.messages, turn: next.turn }
          const chunk = item.frame.type === 'chunk' ? item.frame.chunk : undefined
          if ((chunk?.type === 'text-delta' || chunk?.type === 'reasoning-delta') && typeof chunk.text === 'string') {
            streamedCharsRef.current += chunk.text.length
          }
          continue
        }
        const event = item.event
        if (event.type === 'assistant/message' || event.type === 'turn/end') {
          streamedCharsRef.current = 0
        }
        if (event.type === 'step/end') stepEnded += 1
        if (event.type === 'todo/write') {
          latestTodos = normalizeTodos((event.data as { todos?: unknown }).todos)
        }
        const nextRetry = nextRetryStatus(retry, event)
        if (nextRetry !== retry) {
          retry = nextRetry
          retryDirty = true
        }
        const next = reduceChatEvent(state.messages, event, state.turn, presenterRef.current)
        dirty = dirty || next.changed
        state = { ...state, messages: next.messages, turn: next.turn }
      }
      const split = windowMessages(state.messages, state.turn)
      if (split.evicted.length > 0) {
        state = { ...state, messages: split.active, archive: [...split.evicted, ...state.archive] }
        dirty = true
        archiveDirty = true
      }
      chatStateRef.current = state
      if (dirty && hasFieldSlots('message')) {
        // Probe the live chars instead of concatenating every bubble: a long
        // session pays O(live slots) here, not O(total message bytes) per frame.
        releaseMissingChars('message', fieldCharsOf('message').filter(char =>
          containsChar(state.messages, char) || containsChar(state.archive, char)))
      }
      retryStatusRef.current = retry
      setStreamedChars(previous => previous === streamedCharsRef.current ? previous : streamedCharsRef.current)
      if (stepEnded > 0) setStepBoundary(previous => previous + stepEnded)
      if (archiveDirty) setArchiveCount(state.archive.length)
      if (dirty || archiveDirty) publish(state.messages, state.archive.length)
      if (retryDirty) setRetryStatus(retry)
      const turn = state.turn
      setActivity(previous => previous.running === turn.running && previous.phase === turn.phase && previous.compacting === turn.compacting
        ? previous
        : { running: turn.running, phase: turn.phase, compacting: turn.compacting })
      if (latestTodos !== undefined) {
        setTodos(previous => todosKey(previous) === todosKey(latestTodos!) ? previous : latestTodos!)
      }
    }, FRAME_MS)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!bridge) return
    setModelName(bridge.modelName())
  }, [bridge])
  return {
    messages,
    archiveCount,
    loadEarlier() {
      const state = chatStateRef.current
      const step = Math.min(EARLIER_STEP, state.archive.length)
      if (step === 0) return 0
      const older = state.archive.slice(state.archive.length - step)
      const width = columnsRef.current
      const rowsBefore = rowCount(state.messages, width)
      const messages = [...older, ...state.messages]
      const rowsAfter = rowCount(messages, width)
      chatStateRef.current = { ...state, messages, archive: state.archive.slice(0, state.archive.length - step) }
      setArchiveCount(chatStateRef.current.archive.length)
      publish(messages, chatStateRef.current.archive.length)
      return rowsAfter - rowsBefore
    },
    modelName,
    setModelName,
    updateMessages(fn) {
      const next = fn(chatStateRef.current.messages)
      chatStateRef.current = { ...chatStateRef.current, messages: next }
      publish(next, chatStateRef.current.archive.length)
    },
    resetChat() {
      setMessages([])
      chatStateRef.current = { messages: [], archive: [], turn: initialTurnState() }
      pendingItemsRef.current = []
      retryStatusRef.current = undefined
      streamedCharsRef.current = 0
      releaseFields('message')
      setStreamedChars(0)
      setArchiveCount(0)
      setRetryStatus(undefined)
      setActivity(IDLE_ACTIVITY)
      setTodos(NO_TODOS)
    },
    activity,
    stepBoundary,
    todos,
    retryStatus,
    streamedChars,
    registryCommands,
  }
}
