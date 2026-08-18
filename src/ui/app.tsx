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
import type { ScreenCapture } from '../terminal/screen.ts'
import { SelectionContext } from './selection.tsx'
import { HighlightedText } from './selection.tsx'
import { toScreenSelection, clampFocusRow } from './selection.tsx'
import type { LineSelection } from './selection.tsx'
import { InputBar, INPUT_BAR_HEIGHT } from './input-bar.tsx'
import { MessageList } from './message-list.tsx'
import { ModelsDialog } from './models-dialog.tsx'
import { SessionsDialog } from './sessions-dialog.tsx'
import type { DialogHandle } from './dialog.tsx'
import { padToWidth, truncate } from '../utils/text.ts'
import type { CommandHintState } from './commands.ts'

const FORCE_EXIT_DELAY_MS = 6000
const WHEEL_SCROLL_LINES = 3
const FRAME_MS = 33

interface AppProps {
  bridge?: ChatBridge
  screen?: ScreenCapture
}

export function App({ bridge, screen }: AppProps) {
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
  const [selection, setSelection] = useState<LineSelection | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [modelName, setModelName] = useState('glm 4.7')
  const [stickToBottom, setStickToBottom] = useState(true)
  const [hintState, setHintState] = useState<CommandHintState | null>(null)
  const exiting = useRef(false)
  const screenRef = useRef<ScreenCapture | undefined>(screen)
  const clickCandidateRef = useRef<{ messageId: string; y: number; x: number; moved: boolean } | null>(null)
  const dialogClickCandidateRef = useRef<{ x: number; y: number } | null>(null)
  const messageHeightRef = useRef(1)
  const dialogOpenRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const hintStateRef = useRef<CommandHintState | null>(null)
  const rowsRef = useRef(rows)
  const dialogRef = useRef<DialogHandle | null>(null)
  screenRef.current = screen
  dialogOpenRef.current = dialogOpen || sessionsOpen
  stickToBottomRef.current = stickToBottom
  hintStateRef.current = hintState
  rowsRef.current = rows
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
  messageHeightRef.current = messageHeight
  const screenSelection = useMemo(
    () => toScreenSelection(selection, scrollTop, messageHeight),
    [selection, scrollTop, messageHeight],
  )
  const messageAreaSelection = useMemo(
    () => (selection !== null && selection.inMessage ? screenSelection : null),
    [selection, screenSelection],
  )
  const chromeSelection = useMemo(
    () => (selection !== null && !selection.inMessage ? screenSelection : null),
    [selection, screenSelection],
  )
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
    const inMessageArea = (screenRow: number): boolean => {
      if (screenRow >= messageHeightRef.current) return false
      if (dialogOpenRef.current) return false
      const hint = hintStateRef.current
      if (hint !== null) {
        const hintTop = rowsRef.current - INPUT_BAR_HEIGHT - 1 - hint.commands.length
        if (screenRow >= hintTop) return false
      }
      return true
    }
    const toContentRow = (screenRow: number) =>
      inMessageArea(screenRow) ? screenRow + scrollTopRef.current : screenRow
    const controller = createMouseController(event => {
      switch (event.type) {
        case 'down': {
          if (event.button !== 0) return
          clickCandidateRef.current = null
          dialogClickCandidateRef.current = null
          setSelection(null)
          const contentRow = toContentRow(event.y)
          const hit = rowInfoAt(messagesRef.current, widthRef.current, contentRow)
          const anchorable = screenRef.current?.rowHasText(event.y) ?? false
          const anchorInMessage = inMessageArea(event.y)
          if (dialogOpenRef.current) {
            dialogClickCandidateRef.current = { x: event.x, y: event.y }
            if (anchorable) {
              setSelection({ anchorRow: event.y, anchorCol: event.x, focusRow: event.y, focusCol: event.x, inMessage: false })
            }
            return
          }
          if (hit?.clickable) {
            clickCandidateRef.current = { messageId: hit.messageId, y: event.y, x: event.x, moved: false }
            return
          }
          if (anchorable) {
            setSelection({ anchorRow: contentRow, anchorCol: event.x, focusRow: contentRow, focusCol: event.x, inMessage: anchorInMessage })
          }
          return
        }
        case 'drag': {
          const candidate = clickCandidateRef.current
          if (candidate !== null) {
            candidate.moved = true
            clickCandidateRef.current = null
            const anchorInMessage = inMessageArea(candidate.y)
            setSelection({
              anchorRow: toContentRow(candidate.y),
              anchorCol: candidate.x,
              focusRow: clampFocusRow(anchorInMessage, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
              focusCol: event.x,
              inMessage: anchorInMessage,
            })
            return
          }
          const dialogCandidate = dialogClickCandidateRef.current
          if (dialogCandidate !== null) {
            dialogClickCandidateRef.current = null
            setSelection({
              anchorRow: dialogCandidate.y,
              anchorCol: dialogCandidate.x,
              focusRow: clampFocusRow(false, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
              focusCol: event.x,
              inMessage: false,
            })
            return
          }
          setSelection(current => (current === null ? current : {
            ...current,
            focusRow: clampFocusRow(current.inMessage, event.y, scrollTopRef.current, messageHeightRef.current, rowsRef.current, dialogOpenRef.current),
            focusCol: event.x,
          }))
          return
        }
        case 'up': {
          const candidate = clickCandidateRef.current
          if (candidate !== null && !candidate.moved) {
            handleToggle(candidate.messageId)
          }
          clickCandidateRef.current = null
          const dialogCandidate = dialogClickCandidateRef.current
          if (dialogCandidate !== null) {
            dialogClickCandidateRef.current = null
            dialogRef.current?.clickAt(dialogCandidate.y, dialogCandidate.x)
            setSelection(null)
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
    if (dialogOpenRef.current && !selection) return
    if (key.ctrl && input === 'c') {
      if (selection) {
        const text = selection.inMessage
          ? selectionText(messagesRef.current, widthRef.current, selection)
          : (screenRef.current?.extractSelection(selection) ?? '')
        if (text) writeOsc52(text)
        setSelection(null)
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
    <SelectionContext.Provider value={messageAreaSelection}>
      <Box flexDirection="column" width={columns} height={rows}>
        <MessageList
          messages={messages}
          height={messageHeight}
          width={columns}
          scrollTop={scrollTop}
          onScroll={applyScroll}
          interactive={!dialogOpen && !sessionsOpen}
        />
        <SelectionContext.Provider value={chromeSelection}>
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
                const hintY = Math.max(0, rows - INPUT_BAR_HEIGHT - 1 - hintState.commands.length) + index
                return (
                  <Box key={command.command} width={blockWidth} backgroundColor={selected ? undefined : colors.dialogBackground}>
                    <HighlightedText y={hintY} col={0} text={filled} />
                  </Box>
                )
              })}
            </Box>
          )}
          <Box marginLeft={4}>
            <HighlightedText y={rows - 1} col={4} text={cwdLabel()} color={colors.cwdText} />
          </Box>
        </SelectionContext.Provider>
      {dialogOpen && bridge !== undefined && (
        <SelectionContext.Provider value={chromeSelection}>
          <ModelsDialog
            ref={dialogRef}
            api={bridge}
            onClose={() => setDialogOpen(false)}
            onModelSelected={(_provider, model) => setModelName(model)}
          />
        </SelectionContext.Provider>
      )}
      {sessionsOpen && bridge !== undefined && (
        <SelectionContext.Provider value={chromeSelection}>
          <SessionsDialog
            ref={dialogRef}
            api={bridge}
            onClose={() => setSessionsOpen(false)}
            onBeforeSessionSelected={() => {
              setMessages([])
              setSelection(null)
              chatStateRef.current = { messages: [], turn: initialTurnState() }
              pendingEventsRef.current = []
            }}
            onSessionSelected={() => {
              applyScroll(Infinity)
            }}
          />
        </SelectionContext.Provider>
      )}
      </Box>
    </SelectionContext.Provider>
  )
}

function cwdLabel(): string {
  const home = process.env.HOME ?? ''
  const cwd = process.cwd()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}
