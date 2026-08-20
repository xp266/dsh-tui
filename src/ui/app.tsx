import { Box, Text, useInput } from 'ink'
import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { colors } from '../theme.ts'
import { writeOsc52 } from '../terminal/clipboard.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import { rowCount, selectionText } from './message/layout.ts'
import type { ScreenCapture } from '../terminal/screen.ts'
import { SelectionContext } from './selection.tsx'
import { SelectableText } from './selection.tsx'
import { useTerminalSize } from './hooks/use-terminal-size.ts'
import { useChatEvents } from './hooks/use-chat-events.ts'
import { useScroll } from './hooks/use-scroll.ts'
import { useMouseSelection } from './hooks/use-mouse-selection.ts'
import { InputBar, INPUT_BAR_HEIGHT } from './input/input-bar.tsx'
import { MessageList } from './message/message-list.tsx'
import { ModelsDialog } from './dialog/models-dialog.tsx'
import { SessionsDialog } from './dialog/sessions-dialog.tsx'
import { PresetsDialog } from './dialog/presets-dialog.tsx'
import { EffortDialog } from './dialog/effort-dialog.tsx'
import { DefaultsDialog } from './dialog/defaults-dialog.tsx'
import type { DialogHandle } from './dialog/dialog.tsx'
import { padToWidth, textWidth, truncate } from '../utils/text.ts'
import type { CommandHintState } from './input/commands.ts'
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
  const [hintState, setHintState] = useState<CommandHintState | null>(null)
  const [, setSessionTick] = useState(0)
  const { messages, modelName, setModelName, updateMessages, resetChat } = useChatEvents(bridge, dialog !== null)
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
    dialogOpen: dialog !== null,
    hint: hintState,
    screen,
    onScroll: applyScroll,
    onToggleMessage: handleToggle,
    onDialogClick: (y, x) => dialogRef.current?.clickAt(y, x),
  })
  const handleSend = (text: string) => {
    if (text === '/models') {
      if (bridge) setDialog('models')
      return
    }
    if (text === '/model-effort') {
      if (bridge) setDialog('effort')
      return
    }
    if (text === '/preset') {
      if (bridge) setDialog('presets')
      return
    }
    if (text === '/defaults') {
      if (bridge) setDialog('defaults')
      return
    }
    if (text === '/sessions') {
      if (bridge) setDialog('sessions')
      return
    }
    if (text === '/new') {
      if (!bridge) return
      resetChat()
      clearSelection()
      applyScroll(Infinity)
      void Promise.resolve(bridge.newSession())
        .then(() => setSessionTick(tick => tick + 1))
        .catch(() => {})
      return
    }
    bridge?.send(text)
    applyScroll(Infinity)
  }
  useInput((input, key) => {
    if (dialog !== null && !selection) return
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
          interactive={dialog === null}
          themeTick={themeTick}
        />
        <SelectionContext.Provider value={chromeSelection}>
          <InputBar
            width={columns}
            modelName={bridge?.modelName() ?? modelName}
            permissionMode={bridge?.permissionMode() ?? 'workspace-write'}
            onCyclePermission={() => bridge?.cyclePermission()}
            effortName={bridge?.effortName()}
            presetName={bridge?.presetName()}
            onSend={handleSend}
            interactive={dialog === null}
            onHintChange={setHintState}
          />
          {hintState !== null && dialog === null && (
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
                    <SelectableText y={hintY} col={0} text={filled} inverse={selected} />
                  </Box>
                )
              })}
            </Box>
          )}
          <Box width={columns} paddingLeft={4} paddingRight={4} justifyContent="space-between">
            {bridge === undefined ? (
              <SelectableText y={rows - 1} col={4} text={cwdLabel(undefined)} color={colors.cwdText} />
            ) : (
              <>
                {(() => {
                  const cwd = cwdLabel(bridge)
                  const rightCol = Math.max(4, columns - 4 - textWidth(cwd))
                  const leftMax = Math.max(1, rightCol - 4 - 2)
                  return (
                    <>
                      <SelectableText
                        y={rows - 1}
                        col={4}
                        text={truncate(statsText(bridge.tokenStats()), leftMax)}
                        color={colors.statsText}
                      />
                      <SelectableText y={rows - 1} col={rightCol} text={cwd} color={colors.cwdText} />
                    </>
                  )
                })()}
              </>
            )}
          </Box>
        </SelectionContext.Provider>
      {dialog !== null && bridge !== undefined && (
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
          })}
        </SelectionContext.Provider>
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