import { Box, Text, useInput } from 'ink'
import { useMemo, useRef, useState } from 'react'
import { colors } from '../theme.ts'
import { writeOsc52 } from '../terminal/clipboard.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import { rowCount, selectionText } from './message/layout.ts'
import type { ScreenCapture } from '../terminal/screen.ts'
import { SelectionContext } from './selection.tsx'
import { HighlightedText } from './selection.tsx'
import { useTerminalSize } from './hooks/use-terminal-size.ts'
import { useChatEvents } from './hooks/use-chat-events.ts'
import { useScroll } from './hooks/use-scroll.ts'
import { useMouseSelection } from './hooks/use-mouse-selection.ts'
import { InputBar, INPUT_BAR_HEIGHT } from './input/input-bar.tsx'
import { MessageList } from './message/message-list.tsx'
import { ModelsDialog } from './dialog/models-dialog.tsx'
import { SessionsDialog } from './dialog/sessions-dialog.tsx'
import { PresetsDialog } from './dialog/presets-dialog.tsx'
import type { DialogHandle } from './dialog/dialog.tsx'
import { padToWidth, truncate } from '../utils/text.ts'
import type { CommandHintState } from './input/commands.ts'

const FORCE_EXIT_DELAY_MS = 6000

interface AppProps {
  bridge?: ChatBridge
  screen?: ScreenCapture
}

export function App({ bridge, screen }: AppProps) {
  const { columns, rows } = useTerminalSize()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [hintState, setHintState] = useState<CommandHintState | null>(null)
  const { messages, modelName, setModelName, updateMessages, resetChat } = useChatEvents(bridge, dialogOpen)
  const messageHeight = Math.max(1, rows - INPUT_BAR_HEIGHT - 1)
  const total = useMemo(() => rowCount(messages, columns), [messages, columns])
  const { scrollTop, applyScroll } = useScroll(total, messageHeight, messages)
  const dialogRef = useRef<DialogHandle | null>(null)
  const exiting = useRef(false)
  const handleToggle = (id: string) => {
    updateMessages(current => current.map(message =>
      message.kind === 'collapsible' && message.id === id
        ? { ...message, collapsed: !message.collapsed }
        : message,
    ))
  }
  const { selection, messageAreaSelection, chromeSelection, clearSelection } = useMouseSelection({
    messages,
    columns,
    rows,
    scrollTop,
    messageHeight,
    dialogOpen: dialogOpen || sessionsOpen || presetsOpen,
    hint: hintState,
    screen,
    onScroll: applyScroll,
    onToggleMessage: handleToggle,
    onDialogClick: (y, x) => dialogRef.current?.clickAt(y, x),
  })
  const handleSend = (text: string) => {
    if (text === '/models') {
      if (bridge) setDialogOpen(true)
      return
    }
    if (text === '/preset') {
      if (bridge) setPresetsOpen(true)
      return
    }
    if (text === '/sessions') {
      if (bridge) setSessionsOpen(true)
      return
    }
    if (text === '/new') {
      if (!bridge) return
      resetChat()
      clearSelection()
      applyScroll(Infinity)
      try {
        void Promise.resolve(bridge.newSession()).catch(() => {})
      } catch {}
      return
    }
    bridge?.send(text)
    applyScroll(Infinity)
  }
  useInput((input, key) => {
    if ((dialogOpen || sessionsOpen || presetsOpen) && !selection) return
    if (key.ctrl && input === 'c') {
      if (selection) {
        const text = selection.inMessage
          ? selectionText(messages, columns, selection)
          : (screen?.extractSelection(selection) ?? '')
        if (text) writeOsc52(text)
        clearSelection()
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
          interactive={!dialogOpen && !sessionsOpen && !presetsOpen}
        />
        <SelectionContext.Provider value={chromeSelection}>
          <InputBar
            width={columns}
            modelName={modelName}
            permissionMode={bridge?.permissionMode() ?? 'workspace-write'}
            onCyclePermission={() => bridge?.cyclePermission()}
            onSend={handleSend}
            interactive={!dialogOpen && !sessionsOpen && !presetsOpen}
            onHintChange={setHintState}
          />
          {hintState !== null && !dialogOpen && !sessionsOpen && !presetsOpen && (
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
                  <Box key={command.command} width={blockWidth} backgroundColor={colors.dialogBackground}>
                    <HighlightedText y={hintY} col={0} text={filled} inverse={selected} />
                  </Box>
                )
              })}
            </Box>
          )}
          <Box marginLeft={4}>
            <HighlightedText y={rows - 1} col={4} text={cwdLabel(bridge)} color={colors.cwdText} />
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
              resetChat()
              clearSelection()
            }}
            onSessionSelected={() => {
              applyScroll(Infinity)
            }}
          />
        </SelectionContext.Provider>
      )}
      {presetsOpen && bridge !== undefined && (
        <SelectionContext.Provider value={chromeSelection}>
          <PresetsDialog
            ref={dialogRef}
            api={bridge}
            onClose={() => setPresetsOpen(false)}
          />
        </SelectionContext.Provider>
      )}
      </Box>
    </SelectionContext.Provider>
  )
}

function cwdLabel(bridge: ChatBridge | undefined): string {
  const home = process.env.HOME ?? ''
  const cwd = bridge?.cwd() ?? process.cwd()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}