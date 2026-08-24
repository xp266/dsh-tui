import { Box, Text, useInput } from 'ink'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { colors, permissionModeInfo } from '../theme.ts'
import { writeOsc52 } from '../terminal/clipboard.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type { AgentActivity, AgentPhase } from '../chat/store.ts'
import type { RetryStatus } from '../chat/retry-status.ts'
import { rowIndexFor, selectionText, SPINNER_FRAMES } from './message/layout.ts'
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
import { HINT_COMMAND_COL_WIDTH, matchCommand, visibleCommands, matchAvailableCommand } from './input/commands.ts'
import type { CommandAvailability, CommandId } from './input/commands.ts'
import { CHROME_MARGIN_X, CHROME_TEXT_X, MESSAGE_INPUT_GAP_ROWS, hintBlockTop } from '../core/metrics.ts'
import { useComposer } from './input/use-composer.ts'
import { Region } from './region.tsx'
import { MessageList } from './message/message-list.tsx'
import { CloseGuardContext } from './dialog/dialog.tsx'
import { ModelsDialog } from './dialog/models-dialog.tsx'
import { SessionsDialog } from './dialog/sessions-dialog.tsx'
import { PresetsDialog } from './dialog/presets-dialog.tsx'
import { EffortDialog } from './dialog/effort-dialog.tsx'
import { DefaultsDialog } from './dialog/defaults-dialog.tsx'
import type { DialogHandle } from './dialog/dialog.tsx'
import { padToWidth, textWidth, truncate } from '../core/text.ts'
import type { TokenStats } from '../chat/bridge.ts'
import type { ActivePanel, InteractionStore } from '../chat/interactions.ts'
import { ApprovalPanel } from './panels/approval-panel.tsx'
import type { PanelPointerHandle } from './panels/approval-panel.tsx'
import { QuestionPanel } from './panels/question-panel.tsx'
import { TodoDialog } from './dialog/todo-dialog.tsx'
import { isTodoActive, todoProgress } from '../chat/todo-view.ts'
import type { TodoItemLike } from '../chat/todo-view.ts'
import { useOverlayStack } from './overlay.ts'

const FORCE_EXIT_DELAY_MS = 6000
const INTERRUPT_ARM_MS = 3000
const WORKING_HINT = 'Press esc to interrupt'
const WORKING_ARMED_HINT = 'Press esc again to interrupt'
const CHARS_PER_TOKEN = 4

type DialogKind = 'models' | 'sessions' | 'presets' | 'effort' | 'defaults' | 'todo'

const noopSubscribe = () => () => {}
const nullSnapshot = () => null

function useActivePanel(interactions: InteractionStore | undefined): ActivePanel {
  return useSyncExternalStore(
    interactions?.subscribe ?? noopSubscribe,
    interactions?.getSnapshot ?? nullSnapshot,
  )
}

function commandForCall(bridge: ChatBridge | undefined, callId: string | undefined): string | undefined {
  if (bridge === undefined || callId === undefined) return undefined
  try {
    const args = JSON.parse(bridge.toolPresenter.argsJson(callId) ?? 'null') as { command?: unknown } | null
    return typeof args?.command === 'string' && args.command !== '' ? args.command : undefined
  } catch {
    return undefined
  }
}

function agentStatusLabel(activity: AgentActivity, panel: ActivePanel, retryStatus?: RetryStatus): string {
  if (panel?.kind === 'approval') return 'Waiting for permission'
  if (panel?.kind === 'question') return 'Waiting for selection'
  if (retryStatus !== undefined) {
    const remain = retryStatus.untilTs === 0
      ? undefined
      : Math.max(0, Math.ceil((retryStatus.untilTs - Date.now()) / 1000))
    const progress = `(${retryStatus.attempt}/${retryStatus.maxRetries} · ${retryStatus.code})`
    return remain === undefined ? `Retrying… ${progress}` : `Retrying in ${remain}s ${progress}`
  }
  const labels: Record<AgentPhase, string> = {
    'awaiting-request': 'Awaiting request',
    thinking: 'Thinking',
    working: 'Working',
  }
  return labels[activity.phase]
}

interface AppProps {
  bridge?: ChatBridge
  screen?: ScreenCapture
  themeTick?: number
}

export function App({ bridge, screen, themeTick = 0 }: AppProps) {
  const { columns, rows } = useTerminalSize()
  const overlays = useOverlayStack<DialogKind>()
  const dialog: DialogKind | null = overlays.top ?? null
  const [, setSessionTick] = useState(0)
  const { messages, modelName, setModelName, updateMessages, resetChat, activity, todos, retryStatus, streamedChars } = useChatEvents(bridge, dialog !== null)
  const todoActive = isTodoActive(todos)
  const todoBadge = todoProgress(todos)
  const running = activity.running
  const dialogRef = useRef<DialogHandle | null>(null)
  const inputRef = useRef<InputBarHandle | null>(null)
  const panelHandleRef = useRef<PanelPointerHandle | null>(null)
  const exiting = useRef(false)
  const sendRef = useRef<(text: string) => void>(() => {})
  const isCommandAvailable = useCallback<CommandAvailability>(
    command => command.id !== 'todo' || todoActive,
    [todoActive],
  )
  const [escArmed, setEscArmed] = useState(false)
  const escAtRef = useRef(0)
  const escTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disarmInterrupt = () => {
    escAtRef.current = 0
    setEscArmed(false)
    if (escTimerRef.current !== null) {
      clearTimeout(escTimerRef.current)
      escTimerRef.current = null
    }
  }
  useEffect(() => {
    if (!running) disarmInterrupt()
    return disarmInterrupt
  }, [running])
  const contentWidth = columns - INPUT_WIDTH_OFFSET
  const panel = useActivePanel(bridge?.interactions)
  const [panelHeight, setPanelHeight] = useState(7)
  const composerInteractive = dialog === null && panel === null
  const { value, cursor, hintOpen, commandIndex, api } = useComposer(
    text => sendRef.current(text),
    composerInteractive,
    contentWidth,
    () => bridge?.cyclePermission(),
    isCommandAvailable,
  )
  const layout = inputLayout(value, cursor, columns)
  const permissionMode = bridge?.permissionMode() ?? 'workspace-write'
  const permissionChrome = permissionModeInfo(permissionMode)
  const bottomHeight = panel === null ? layout.barHeight : panelHeight + 1
  const inputHeight = bottomHeight
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
      case 'todo':
        if (bridge && todoActive) overlays.push('todo')
        return
      case 'model-effort':
        if (bridge) overlays.push('effort')
        return
      case 'preset':
        if (bridge) overlays.push('presets')
        return
      case 'models':
      case 'defaults':
      case 'sessions':
        if (bridge) overlays.push(id)
        return
    }
  }
  const handleSend = (text: string) => {
    const matched = matchAvailableCommand(text, isCommandAvailable)
    if (matched !== undefined) {
      runCommand(matched.id)
      return
    }
    if (matchCommand(text) !== undefined) return
    bridge?.send(text)
    applyScroll(Infinity)
  }
  sendRef.current = handleSend
  const commands = useMemo(
    () => visibleCommands(value, isCommandAvailable),
    [value, isCommandAvailable],
  )
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
    panelActive: panel !== null,
    panelHandle: panelHandleRef,
    onHintClick: handleHintClick,
    onDialogWheel: (y, dir) => dialogRef.current?.wheelAt(y, dir) === true,
    onScroll: applyScroll,
    onToggleMessage: handleToggle,
    onDialogClick: (y, x) => dialogRef.current?.clickAt(y, x),
  })
  useInput((input, key) => {
    if (dialog !== null && !selection) return
    if (key.escape) {
      if (panel === null && running && bridge !== undefined) {
        const now = Date.now()
        if (escArmed && now - escAtRef.current <= INTERRUPT_ARM_MS) {
          disarmInterrupt()
          bridge.interrupt()
        } else {
          escAtRef.current = now
          setEscArmed(true)
          if (escTimerRef.current !== null) clearTimeout(escTimerRef.current)
          escTimerRef.current = setTimeout(disarmInterrupt, INTERRUPT_ARM_MS)
        }
      }
      return
    }
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
          {panel === null && (
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
              permissionMode={permissionMode}
              effortName={bridge?.effortName()}
              presetName={bridge?.presetName()}
              interactive={composerInteractive}
            />
          )}
          {panel !== null && bridge !== undefined && (
            panel.kind === 'approval' ? (
              <ApprovalPanel
                key={`approval-${panel.approval.id}`}
                handleRef={panelHandleRef}
                reason={panel.approval.reason}
                command={commandForCall(bridge, panel.approval.callId)}
                background={permissionChrome.color}
                active={dialog === null}
                columns={columns}
                rows={rows}
                innerWidth={contentWidth}
                blockWidth={contentWidth + 4}
                onDecide={outcome => bridge.interactions.settleApproval(panel.approval.id, outcome)}
                onResize={setPanelHeight}
              />
            ) : (
              <QuestionPanel
                key={`question-${panel.question.id}`}
                handleRef={panelHandleRef}
                question={panel.question}
                background={permissionChrome.color}
                active={dialog === null}
                columns={columns}
                rows={rows}
                innerWidth={contentWidth}
                blockWidth={contentWidth + 4}
                onSubmit={answer => bridge.interactions.answerQuestion(panel.question.id, answer)}
                onCancel={() => bridge.interactions.cancelQuestion(panel.question.id, 'the user closed the question panel')}
                onResize={setPanelHeight}
              />
            )
          )}
          {hintState !== null && dialog === null && panel === null && (
            <Box
              position="absolute"
              top={hintBlockTop(rows, inputHeight, hintState.commands.length)}
              left={CHROME_MARGIN_X}
              width={Math.max(1, columns - CHROME_MARGIN_X * 2)}
              flexDirection="column"
            >
              <Region y={hintBlockTop(rows, inputHeight, hintState.commands.length)}>
                {hintState.commands.map((command, index) => {
                  const selected = index === hintState.selectedIndex
                  const blockWidth = Math.max(1, columns - CHROME_MARGIN_X * 2)
                  const line = '  ' + padToWidth(command.command, HINT_COMMAND_COL_WIDTH) + command.description
                  const filled = padToWidth(truncate(line, blockWidth), blockWidth)
                  return (
                    <Box key={command.command} width={blockWidth} backgroundColor={colors.dialogBackground}>
                      <SelectableText y={index} col={0} text={filled} inverse={selected} />
                    </Box>
                  )
                })}
              </Region>
            </Box>
          )}
          {bridge !== undefined && (
            <Box position="absolute" top={rows - 1} left={0} width={columns} height={1}>
              <Region y={rows - 1}>
                {(() => {
                  const badge = running && todoBadge !== undefined ? `[Task ${todoBadge.current}/${todoBadge.total}] ` : ''
                  const leftText = running ? `${badge}${agentStatusLabel(activity, panel, retryStatus)}` : cwdLabel(bridge)
                  const hint = running ? (escArmed ? WORKING_ARMED_HINT : WORKING_HINT) : undefined
                  const hintCol = CHROME_TEXT_X + textWidth(leftText) + 2
                  const leftWidth = textWidth(leftText) + (hint === undefined ? 0 : 2 + textWidth(hint))
                  const avail = columns - CHROME_MARGIN_X * 2 - CHROME_TEXT_X
                  const stats = truncate(statsText(bridge.tokenStats(), streamedChars), Math.max(1, avail - leftWidth - 2))
                  const rightCol = Math.max(CHROME_TEXT_X + leftWidth, columns - CHROME_MARGIN_X * 2 - textWidth(stats))
                  return (
                    <>
                      <Box position="absolute" top={0} left={CHROME_MARGIN_X} width={columns - CHROME_MARGIN_X}>
                        {running && <SpinnerGlyph />}
                      </Box>
                      <Box position="absolute" top={0} left={CHROME_TEXT_X} width={columns - CHROME_TEXT_X}>
                        <SelectableText
                          y={0}
                          col={CHROME_TEXT_X}
                          text={leftText}
                          color={running ? colors.workspaceWriteText : colors.cwdText}
                        />
                      </Box>
                      {hint !== undefined && (
                        <Box position="absolute" top={0} left={hintCol} width={Math.max(1, columns - hintCol)}>
                          <SelectableText y={0} col={hintCol} text={hint} color={colors.dialogHintText} />
                        </Box>
                      )}
                      <Box position="absolute" top={0} left={rightCol} width={Math.max(1, columns - rightCol)}>
                        <SelectableText y={0} col={rightCol} text={stats} color={colors.statsText} />
                      </Box>
                    </>
                  )
                })()}
              </Region>
            </Box>
          )}
        </SelectionContext.Provider>
      {dialog !== null && bridge !== undefined && (
        <CloseGuardContext.Provider value={selection !== null}>
          <SelectionContext.Provider value={chromeSelection}>
            {dialogView(dialog, bridge, {
              dialogRef,
              onClose: () => overlays.pop(),
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
            }, todos)}
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

function dialogView(kind: DialogKind, bridge: ChatBridge, cbs: DialogCallbacks, todos: TodoItemLike[]): ReactNode {
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
    case 'todo':
      return <TodoDialog ref={cbs.dialogRef} todos={todos} onClose={cbs.onClose} />
  }
}

function SpinnerGlyph() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => (t + 1) % SPINNER_FRAMES.length), 100)
    return () => clearInterval(timer)
  }, [])
  return (
    <SelectableText
      y={0}
      col={CHROME_MARGIN_X}
      text={`${SPINNER_FRAMES[tick % SPINNER_FRAMES.length]} `}
      color={colors.workspaceWriteText}
    />
  )
}

function cwdLabel(bridge: ChatBridge | undefined): string {
  const home = process.env.HOME ?? ''
  const cwd = bridge?.cwd() ?? process.cwd()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}

function statsText(stats: TokenStats, streamedChars = 0): string {
  const estimate = Math.ceil(streamedChars / CHARS_PER_TOKEN)
  const contextPercent = estimate > 0 && stats.projectedTokens !== undefined && stats.contextWindow !== undefined
    ? Math.min(100, Math.round((stats.projectedTokens + estimate) / stats.contextWindow * 100))
    : stats.contextPercent
  const context = `Context ${contextPercent}%`
  const hit = `Hit ${stats.hitPercent}%`
  const tokens = `${formatTokens(stats.input)} → ${formatTokens(stats.output + estimate)}`
  return `${context} | ${hit} | ${tokens}`
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  const scaled = (v: number): string => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}