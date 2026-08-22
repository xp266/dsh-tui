import { Box, Text, useInput } from 'ink'
import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { colors } from '../theme.ts'
import { writeOsc52 } from '../terminal/clipboard.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import { rowIndexFor, selectionText } from './message/layout.ts'
import { chromeSelectionText } from './selection-registry.ts'
import type { ScreenCapture } from '../terminal/screen.ts'
import { SelectionContext } from './selection.tsx'
import { SelectableText } from './selection.tsx'
import { useTerminalSize } from './hooks/use-terminal-size.ts'
import { useChatEvents } from './hooks/use-chat-events.ts'
import { useScroll } from './hooks/use-scroll.ts'
import { useMouseSelection, hintRegion } from './hooks/use-mouse-selection.ts'
import { InputBar, inputLayout, INPUT_WIDTH_OFFSET, HINT_MAX_ROWS } from './input/input-bar.tsx'
import type { InputBarHandle } from './input/input-bar.tsx'
import { HINT_COMMAND_COL_WIDTH, matchCommand } from './input/commands.ts'
import type { CommandId } from './input/commands.ts'
import { CHROME_MARGIN_X, MESSAGE_INPUT_GAP_ROWS, hintWindowTop } from './layout-metrics.ts'
import { useComposer } from './input/use-composer.ts'
import { filterCommands } from './input/commands.ts'
import { MessageList } from './message/message-list.tsx'
import { CloseGuardContext } from './dialog/dialog.tsx'
import { ModelsDialog } from './dialog/models-dialog.tsx'
import { SessionsDialog } from './dialog/sessions-dialog.tsx'
import { PresetsDialog } from './dialog/presets-dialog.tsx'
import { EffortDialog } from './dialog/effort-dialog.tsx'
import { DefaultsDialog } from './dialog/defaults-dialog.tsx'
import type { DialogHandle } from './dialog/dialog.tsx'
import { padToWidth, textWidth, truncate } from '../utils/text.ts'
import type { TokenStats } from '../chat/bridge.ts'

const FORCE_EXIT_DELAY_MS = 6000

type DialogKind = 'models' | 'sessions' | 'presets' | 'effort' | 'defaults'

interface AppProps {
  bridge?: ChatBridge
  screen?: ScreenCapture
  themeTick?: number
}

export function App({ bridge, screen, themeTick = 0 }: AppProps) {
  const { columns, rows } = useTerminalSize()
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [, setSessionTick] = useState(0)
  const { messages, modelName, setModelName, updateMessages, resetChat } = useChatEvents(bridge, dialog !== null)
  const dialogRef = useRef<DialogHandle | null>(null)
  const inputRef = useRef<InputBarHandle | null>(null)
  const exiting = useRef(false)
  const sendRef = useRef<(text: string) => void>(() => {})
  const contentWidth = columns - INPUT_WIDTH_OFFSET
  const { value, cursor, hintOpen, commandIndex, api } = useComposer(
    text => sendRef.current(text),
    dialog === null,
    contentWidth,
    () => bridge?.cyclePermission(),
  )
  const layout = inputLayout(value, cursor, columns)
  const inputHeight = layout.barHeight
  const messageHeight = Math.max(1, rows - inputHeight - MESSAGE_INPUT_GAP_ROWS)
  const total = rowIndexFor(messages, columns).total
  const { scrollTop, applyScroll } = useScroll(total, messageHeight, messages)
  const startNewSession = () => {
    if (!bridge) return
    resetChat()
    clearSelection()
    applyScroll(Infinity)
    void Promise.resolve(bridge.newSession())
      .then(() => setSessionTick(tick => tick + 1))
      .catch(() => {})
  }
  const runCommand = (id: CommandId) => {
    switch (id) {
      case 'new':
        startNewSession()
        return
      case 'model-effort':
        if (bridge) setDialog('effort')
        return
      case 'preset':
        if (bridge) setDialog('presets')
        return
      case 'models':
      case 'defaults':
      case 'sessions':
        if (bridge) setDialog(id)
        return
    }
  }
  const handleSend = (text: string) => {
    const matched = matchCommand(text)
    if (matched !== undefined) {
      runCommand(matched.id)
      return
    }
    bridge?.send(text)
    applyScroll(Infinity)
  }
  sendRef.current = handleSend
  const commands = useMemo(() => filterCommands(value), [value])
  const showHint = dialog === null && hintOpen && commands.length > 0
  const maxVisible = Math.max(1, Math.min(HINT_MAX_ROWS, rows - inputHeight - 1))
  const hintStartRef = useRef(0)
  let hintVisibleStart = hintStartRef.current
  if (commandIndex < hintVisibleStart) {
    hintVisibleStart = commandIndex
  } else if (commandIndex >= hintVisibleStart + maxVisible) {
    hintVisibleStart = commandIndex - maxVisible + 1
  }
  hintVisibleStart = Math.max(0, Math.min(hintVisibleStart, Math.max(0, commands.length - maxVisible)))
  hintStartRef.current = hintVisibleStart
  const hintState = showHint
    ? {
        commands: commands.slice(hintVisibleStart, hintVisibleStart + maxVisible),
        selectedIndex: commandIndex - hintVisibleStart,
        startIndex: hintVisibleStart,
      }
    : null
  const handleToggle = (id: string) => {
    updateMessages(current => current.map(message =>
      message.kind === 'collapsible' && message.id === id
        ? { ...message, collapsed: !message.collapsed }
        : message,
    ))
  }
  const handleHintClick = (y: number) => {
    const region = hintRegion(rows, hintState, dialog !== null, inputHeight)
    if (region === null || hintState === null) return
    const rel = y - region.top
    if (rel < 0 || rel >= hintState.commands.length) return
    inputRef.current?.hintClick((hintState.startIndex ?? 0) + rel)
  }
  const { selection, messageAreaSelection, chromeSelection, clearSelection } = useMouseSelection({
    messages,
    columns,
    rows,
    scrollTop,
    messageHeight,
    inputHeight,
    dialogOpen: dialog !== null,
    hint: hintState,
    screen,
    inputHandle: inputRef,
    onHintClick: handleHintClick,
    onDialogWheel: (y, dir) => dialogRef.current?.wheelAt(y, dir) === true,
    onScroll: applyScroll,
    onToggleMessage: handleToggle,
    onDialogClick: (y, x) => dialogRef.current?.clickAt(y, x),
  })
  useInput((input, key) => {
    if (dialog !== null && !selection) return
    if (key.ctrl && input === 'c') {
      if (selection) {
        const text = selection.inMessage
          ? selectionText(messages, columns, selection)
          : chromeSelectionText(selection)
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
          interactive={dialog === null}
          themeTick={themeTick}
        />
        <SelectionContext.Provider value={chromeSelection}>
          <InputBar
            ref={inputRef}
            width={columns}
            columns={columns}
            rows={rows}
            value={value}
            cursor={cursor}
            api={api}
            statusReady={bridge !== undefined}
            modelName={bridge?.modelName() ?? modelName}
            permissionMode={bridge?.permissionMode() ?? 'workspace-write'}
            effortName={bridge?.effortName()}
            presetName={bridge?.presetName()}
            interactive={dialog === null}
          />
          {hintState !== null && dialog === null && (
            <Box
              position="absolute"
              top={hintWindowTop(rows, inputHeight, hintState.commands.length)}
              left={CHROME_MARGIN_X}
              width={Math.max(1, columns - 4)}
              flexDirection="column"
            >
              {hintState.commands.map((command, index) => {
                const selected = index === hintState.selectedIndex
                const blockWidth = Math.max(1, columns - 4)
                const line = '  ' + padToWidth(command.command, HINT_COMMAND_COL_WIDTH) + command.description
                const filled = padToWidth(truncate(line, blockWidth), blockWidth)
                const hintY = hintWindowTop(rows, inputHeight, hintState.commands.length) + index
                return (
                  <Box key={command.command} width={blockWidth} backgroundColor={colors.dialogBackground}>
                    <SelectableText y={hintY} col={0} text={filled} inverse={selected} />
                  </Box>
                )
              })}
            </Box>
          )}
          {bridge !== undefined && (
            <Box
              position="absolute"
              top={rows - 1}
              left={0}
              width={columns}
              paddingLeft={4}
              paddingRight={4}
              justifyContent="space-between"
            >
              {(() => {
                const cwd = cwdLabel(bridge)
                const rightCol = Math.max(4, columns - 4 - textWidth(cwd))
                const stats = truncate(statsText(bridge.tokenStats()), Math.max(1, rightCol - 4 - 2))
                return (
                  <>
                    <SelectableText y={rows - 1} col={4} text={stats} color={colors.statsText} />
                    <SelectableText y={rows - 1} col={rightCol} text={cwd} color={colors.cwdText} />
                  </>
                )
              })()}
            </Box>
          )}
        </SelectionContext.Provider>
      {dialog !== null && bridge !== undefined && (
        <CloseGuardContext.Provider value={selection !== null}>
          <SelectionContext.Provider value={chromeSelection}>
            {dialogView(dialog, bridge, {
              dialogRef,
              onClose: () => setDialog(null),
              onModelSelected: (_provider, model) => setModelName(model),
              onBeforeSessionSelected: () => {
                resetChat()
                clearSelection()
              },
              onSessionSelected: () => {
                setSessionTick(tick => tick + 1)
                applyScroll(Infinity)
              },
              onNewSession: startNewSession,
            })}
          </SelectionContext.Provider>
        </CloseGuardContext.Provider>
      )}
      </Box>
    </SelectionContext.Provider>
  )
}

interface DialogCallbacks {
  dialogRef: RefObject<DialogHandle | null>
  onClose(): void
  onModelSelected(provider: string, model: string): void
  onBeforeSessionSelected(): void
  onSessionSelected(): void
  onNewSession(): void
}

function dialogView(kind: DialogKind, bridge: ChatBridge, cbs: DialogCallbacks): ReactNode {
  switch (kind) {
    case 'models':
      return <ModelsDialog ref={cbs.dialogRef} api={bridge} onClose={cbs.onClose} onModelSelected={cbs.onModelSelected} />
    case 'sessions':
      return (
        <SessionsDialog
          ref={cbs.dialogRef}
          api={bridge}
          onClose={cbs.onClose}
          onBeforeSessionSelected={cbs.onBeforeSessionSelected}
          onSessionSelected={cbs.onSessionSelected}
          onNewSession={cbs.onNewSession}
        />
      )
    case 'presets':
      return <PresetsDialog ref={cbs.dialogRef} api={bridge} onClose={cbs.onClose} />
    case 'effort':
      return <EffortDialog ref={cbs.dialogRef} api={bridge} onClose={cbs.onClose} />
    case 'defaults':
      return <DefaultsDialog ref={cbs.dialogRef} api={bridge} onClose={cbs.onClose} />
  }
}

function cwdLabel(bridge: ChatBridge | undefined): string {
  const home = process.env.HOME ?? ''
  const cwd = bridge?.cwd() ?? process.cwd()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}

function statsText(stats: TokenStats): string {
  const context = `Context ${stats.contextPercent}%`
  const hit = `Hit ${stats.hitPercent}%`
  const tokens = `${formatTokens(stats.input)} → ${formatTokens(stats.output)}`
  return `${context} | ${hit} | ${tokens}`
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  const scaled = (v: number): string => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}