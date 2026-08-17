import { Box, Text, useInput, useStdout } from 'ink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Message } from '../state/messages.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { colors } from '../theme.ts'
import { createMouseController } from '../terminal/mouse.ts'
import { writeOsc52 } from '../terminal/clipboard.ts'
import { initialTurnState, reduceChatEvent } from '../chat/reducer.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import { rowCount, rowInfoAt, selectionText } from './layout.ts'
import type { SelectionPoint, SelectionRect } from './layout.ts'
import { dragRect } from './layout.ts'
import { InputBar, INPUT_BAR_HEIGHT } from './input-bar.tsx'
import { MessageList } from './message-list.tsx'
import { ModelsDialog } from './models-dialog.tsx'
import { SessionsDialog } from './sessions-dialog.tsx'
import type { DialogHandle } from './dialog.tsx'
import { padToWidth, textWidth, truncate } from '../utils/text.ts'
import type { CommandHintState } from './commands.ts'

const FORCE_EXIT_DELAY_MS = 6000
const WHEEL_SCROLL_LINES = 3
const FRAME_MS = 33

interface AppProps {
  bridge?: ChatBridge
}

export function App({ bridge }: AppProps) {
  const { stdout } = useStdout()
  const [columns, setColumns] = useState(stdout?.columns ?? 80)
  const [rows, setRows] = useState(stdout?.rows ?? 24)
  useEffect(() => {
    if (!stdout) return
    const onResize = () => {
      setColumns(stdout.columns)
      setRows(stdout.rows)
    }
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])
  const [messages, setMessages] = useState<Message[]>([])
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [modelName, setModelName] = useState('glm 4.7')
  const [stickToBottom, setStickToBottom] = useState(true)
  const [hintState, setHintState] = useState<CommandHintState | null>(null)
  const exiting = useRef(false)
  const anchorRef = useRef<SelectionPoint | null>(null)
  const dialogOpenRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const dialogRef = useRef<DialogHandle | null>(null)
  dialogOpenRef.current = dialogOpen || sessionsOpen
  stickToBottomRef.current = stickToBottom
  const chatStateRef = useRef<{ messages: Message[]; turn: ReturnType<typeof initialTurnState> }>({
    messages: [],
    turn: initialTurnState(),
  })
  const pendingEventsRef = useRef<SessionEvent[]>([])
  const scrollTopRef = useRef(0)
  const messagesRef = useRef(messages)
  const widthRef = useRef(columns)
  const maxScrollRef = useRef(0)
  messagesRef.current = messages
  widthRef.current = columns
  const messageHeight = Math.max(1, rows - INPUT_BAR_HEIGHT - 1)
  const total = useMemo(() => rowCount(messages, columns), [messages, columns])
  const maxScroll = Math.max(0, total - messageHeight)
  maxScrollRef.current = maxScroll
  const applyScroll = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(maxScrollRef.current, next))
    setScrollTop(clamped)
    scrollTopRef.current = clamped
    const atBottom = clamped >= maxScrollRef.current
    setStickToBottom(atBottom)
    stickToBottomRef.current = atBottom
  }, [])
  useEffect(() => {
    if (stickToBottomRef.current) {
      applyScroll(Infinity)
    } else {
      setScrollTop(current => Math.min(current, maxScroll))
      scrollTopRef.current = Math.min(scrollTopRef.current, maxScroll)
    }
  }, [maxScroll])
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
        state = reduceChatEvent(state.messages, event, state.turn)
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
  useEffect(() => {
    if (stickToBottomRef.current) applyScroll(Infinity)
  }, [messages])
  const handleSend = (text: string) => {
    if (text === '/models') {
      if (bridge) setDialogOpen(true)
      return
    }
    if (text === '/sessions') {
      if (bridge) setSessionsOpen(true)
      return
    }
    if (text === '/new') {
      if (!bridge) return
      setMessages([])
      setSelection(null)
      anchorRef.current = null
      chatStateRef.current = { messages: [], turn: initialTurnState() }
      pendingEventsRef.current = []
      applyScroll(Infinity)
      try {
        void Promise.resolve(bridge.newSession()).catch(() => {})
      } catch {}
      return
    }
    bridge?.send(text)
    applyScroll(Infinity)
  }
  const handleToggle = (id: string) => {
    setMessages(current => current.map(message =>
      message.kind === 'collapsible' && message.id === id
        ? { ...message, collapsed: !message.collapsed }
        : message,
    ))
  }
  useEffect(() => {
    const controller = createMouseController(event => {
      if (dialogOpenRef.current) {
        dialogRef.current?.clickAt(event.y, event.x)
        return
      }
      switch (event.type) {
        case 'down': {
          if (event.button !== 0) return
          anchorRef.current = null
          setSelection(null)
          const contentRow = event.y + scrollTopRef.current
          const hit = rowInfoAt(messagesRef.current, widthRef.current, contentRow)
          if (!hit) return
          if (hit.clickable) {
            handleToggle(hit.messageId)
            return
          }
          if (hit.selectable && event.x >= hit.colStart && event.x < hit.colStart + textWidth(hit.text)) {
            anchorRef.current = { row: contentRow, x: event.x }
            setSelection({ top: contentRow, bottom: contentRow, left: event.x, right: event.x + 1 })
          }
          return
        }
        case 'drag': {
          const anchor = anchorRef.current
          if (anchor) {
            setSelection(dragRect(anchor, event.y + scrollTopRef.current, event.x))
          }
          return
        }
        case 'scroll': {
          const delta = event.scrollDirection === 'up' ? -WHEEL_SCROLL_LINES : WHEEL_SCROLL_LINES
          applyScroll(scrollTopRef.current + delta)
          return
        }
        default:
          return
      }
    })
    controller.enable()
    return () => controller.disable()
  }, [])
  useInput((input, key) => {
    if (dialogOpenRef.current) return
    if (key.ctrl && input === 'c') {
      if (selection) {
        const text = selectionText(messagesRef.current, widthRef.current, selection)
        if (text) writeOsc52(text)
        setSelection(null)
        anchorRef.current = null
        return
      }
      if (!exiting.current) {
        exiting.current = true
        process.kill(process.pid, 'SIGINT')
        setTimeout(() => process.exit(0), FORCE_EXIT_DELAY_MS).unref()
      }
    }
  })
  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <MessageList
        messages={messages}
        height={messageHeight}
        width={columns}
        selection={selection}
        scrollTop={scrollTop}
        onScroll={applyScroll}
        interactive={!dialogOpen && !sessionsOpen}
      />
      <InputBar width={columns} modelName={modelName} onSend={handleSend} interactive={!dialogOpen && !sessionsOpen} onHintChange={setHintState} />
      {hintState !== null && !dialogOpen && !sessionsOpen && (
        <Box
          position="absolute"
          top={Math.max(0, rows - INPUT_BAR_HEIGHT - 1 - hintState.commands.length)}
          left={2}
          width={Math.max(1, columns - 4)}
          flexDirection="column"
        >
          {hintState.commands.map((command, index) => {
            const selected = index === hintState.selectedIndex
            const blockWidth = Math.max(1, columns - 4)
            const line = '  ' + padToWidth(command.command, 20) + command.description
            const filled = padToWidth(truncate(line, blockWidth), blockWidth)
            return (
              <Box key={command.command} width={blockWidth} backgroundColor={selected ? undefined : colors.dialogBackground}>
                <Text inverse={selected}>{filled}</Text>
              </Box>
            )
          })}
        </Box>
      )}
      <Box marginLeft={4}>
        <Text color={colors.cwdText}>{cwdLabel()}</Text>
      </Box>
      {dialogOpen && bridge !== undefined && (
        <ModelsDialog
          ref={dialogRef}
          api={bridge}
          onClose={() => setDialogOpen(false)}
          onModelSelected={(_provider, model) => setModelName(model)}
        />
      )}
      {sessionsOpen && bridge !== undefined && (
        <SessionsDialog
          ref={dialogRef}
          api={bridge}
          onClose={() => setSessionsOpen(false)}
          onBeforeSessionSelected={() => {
            setMessages([])
            setSelection(null)
            anchorRef.current = null
            chatStateRef.current = { messages: [], turn: initialTurnState() }
            pendingEventsRef.current = []
          }}
          onSessionSelected={() => {
            applyScroll(Infinity)
          }}
        />
      )}
    </Box>
  )
}

function cwdLabel(): string {
  const home = process.env.HOME ?? ''
  const cwd = process.cwd()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}
