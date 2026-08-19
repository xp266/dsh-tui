import { useEffect, useRef, useState } from 'react'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ChatBridge, ChatToolPresenter } from '../../chat/bridge.ts'
import { initialTurnState, reduceChatEvent } from '../../chat/store.ts'
import type { Message } from '../../model/message.ts'

const FRAME_MS = 33

export interface ChatEvents {
  messages: Message[]
  modelName: string
  setModelName(name: string): void
  updateMessages(fn: (messages: Message[]) => Message[]): void
  resetChat(): void
}

export function useChatEvents(bridge: ChatBridge | undefined, dialogOpen: boolean): ChatEvents {
  const [messages, setMessages] = useState<Message[]>([])
  const [modelName, setModelName] = useState('glm 4.7')
  const chatStateRef = useRef<{ messages: Message[]; turn: ReturnType<typeof initialTurnState> }>({
    messages: [],
    turn: initialTurnState(),
  })
  const pendingEventsRef = useRef<SessionEvent[]>([])
  const presenterRef = useRef<ChatToolPresenter | undefined>(undefined)
  const dialogOpenRef = useRef(false)
  dialogOpenRef.current = dialogOpen
  useEffect(() => {
    presenterRef.current = bridge?.toolPresenter
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
      for (const event of events) {
        state = reduceChatEvent(state.messages, event, state.turn, presenterRef.current)
      }
      chatStateRef.current = state
      setMessages([...state.messages])
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
    },
  }
}