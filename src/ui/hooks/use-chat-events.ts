import { useEffect, useRef, useState } from 'react'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ChatBridge, ChatToolPresenter, RegistryCommand } from '../../chat/bridge.ts'
import { initialTurnState, reduceChatEvent } from '../../chat/store.ts'
import { nextRetryStatus } from '../../chat/retry-status.ts'
import type { RetryStatus } from '../../chat/retry-status.ts'
import type { AgentActivity } from '../../chat/store.ts'
import { normalizeTodos } from '../../chat/todo-view.ts'
import type { TodoItemLike } from '../../chat/todo-view.ts'
import type { Message } from '../../model/message.ts'

const FRAME_MS = 33

const IDLE_ACTIVITY: AgentActivity = { running: false, phase: 'awaiting-request', compacting: false }
const NO_TODOS: TodoItemLike[] = []

function todosKey(todos: readonly TodoItemLike[]): string {
  return todos.map(item => `${item.status}:${item.content}`).join('\n')
}

export interface ChatEvents {
  messages: Message[]
  modelName: string
  setModelName(name: string): void
  updateMessages(fn: (messages: Message[]) => Message[]): void
  resetChat(): void
  activity: AgentActivity
  todos: TodoItemLike[]
  retryStatus?: RetryStatus
  streamedChars: number
  registryCommands: readonly RegistryCommand[]
}

export function useChatEvents(bridge: ChatBridge | undefined, dialogOpen: boolean): ChatEvents {
  const [messages, setMessages] = useState<Message[]>([])
  const [modelName, setModelName] = useState('deepseek-v4-flash')
  const [activity, setActivity] = useState<AgentActivity>(IDLE_ACTIVITY)
  const [todos, setTodos] = useState<TodoItemLike[]>(NO_TODOS)
  const [retryStatus, setRetryStatus] = useState<RetryStatus | undefined>(undefined)
  const [streamedChars, setStreamedChars] = useState(0)
  const [registryCommands, setRegistryCommands] = useState<readonly RegistryCommand[]>([])
  const streamedCharsRef = useRef(0)
  const chatStateRef = useRef<{ messages: Message[]; turn: ReturnType<typeof initialTurnState> }>({
    messages: [],
    turn: initialTurnState(),
  })
  const pendingEventsRef = useRef<SessionEvent[]>([])
  const retryStatusRef = useRef<RetryStatus | undefined>(undefined)
  const presenterRef = useRef<ChatToolPresenter | undefined>(undefined)
  const dialogOpenRef = useRef(false)
  dialogOpenRef.current = dialogOpen
  useEffect(() => {
    presenterRef.current = bridge?.toolPresenter
    const list = bridge?.listRegistryCommands?.bind(bridge)
    const onChanged = bridge?.onRegistryChanged?.bind(bridge)
    if (bridge === undefined || list === undefined || onChanged === undefined) {
      setRegistryCommands([])
      return
    }
    setRegistryCommands(list())
    return onChanged(() => setRegistryCommands(list()))
  }, [bridge])
  useEffect(() => {
    if (!bridge) return
    return bridge.subscribe(event => {
      pendingEventsRef.current.push(event)
    })
  }, [bridge])
  useEffect(() => {
    const timer = setInterval(() => {
      if (dialogOpenRef.current) return
      const events = pendingEventsRef.current
      if (events.length === 0) return
      pendingEventsRef.current = []
      let state = chatStateRef.current
      let dirty = false
      let latestTodos: TodoItemLike[] | undefined
      let retry: RetryStatus | undefined = retryStatusRef.current
      let retryDirty = false
      for (const event of events) {
        if (event.type === 'assistant/chunk') {
          const chunk = (event.data as { chunk?: { type?: string; text?: string } }).chunk
          if ((chunk?.type === 'text-delta' || chunk?.type === 'reasoning-delta') && typeof chunk.text === 'string') {
            streamedCharsRef.current += chunk.text.length
          }
        } else if (event.type === 'assistant/message' || event.type === 'turn/end') {
          streamedCharsRef.current = 0
        }
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
        state = { messages: next.messages, turn: next.turn }
      }
      chatStateRef.current = state
      retryStatusRef.current = retry
      setStreamedChars(previous => previous === streamedCharsRef.current ? previous : streamedCharsRef.current)
      if (dirty) setMessages([...state.messages])
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
    modelName,
    setModelName,
    updateMessages(fn) {
      const next = fn(chatStateRef.current.messages)
      chatStateRef.current = { ...chatStateRef.current, messages: next }
      setMessages(next)
    },
    resetChat() {
      setMessages([])
      chatStateRef.current = { messages: [], turn: initialTurnState() }
      pendingEventsRef.current = []
      retryStatusRef.current = undefined
      streamedCharsRef.current = 0
      setStreamedChars(0)
      setRetryStatus(undefined)
      setActivity(IDLE_ACTIVITY)
      setTodos(NO_TODOS)
    },
    activity,
    todos,
    retryStatus,
    streamedChars,
    registryCommands,
  }
}
