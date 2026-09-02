import { Box, Text, useInput } from 'ink'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { COLORS, permissionModeInfo } from '../theme.ts'
import { writeClipboardText } from '../terminal/clipboard.ts'
import { copySelection } from './selection/service.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type { AgentActivity } from '../chat/store.ts'
import { rowIndexFor, selectionText } from './message/layout.ts'
import { glyphs } from '../terminal/glyphs.ts'
import { chromeSelectionText } from './selection-registry.ts'
import type { ScreenCapture } from '../terminal/screen.ts'
import type { LineSelection } from '../model/selection.ts'
import { SelectionContext } from './selection.tsx'
import { SelectableText } from './selection.tsx'
import { useTerminalSize } from './hooks/use-terminal-size.ts'
import { useChatEvents } from './hooks/use-chat-events.ts'
import { useScroll } from './hooks/use-scroll.ts'
import { useMouseSelection, hintRegion } from './hooks/use-mouse-selection.ts'
import { isKeyConsumed } from './key-arbiter.ts'
import { KeymapGate } from './chrome/key-gate.tsx'
import { useOverlayContribution } from './contributions.ts'
import { InputBar, inputLayout, INPUT_WIDTH_OFFSET, HINT_MAX_ROWS } from './input/input-bar.tsx'
import type { InputBarHandle } from './input/input-bar.tsx'
import { COMMANDS, KNOWN_COMMAND_ARGS, commandArgHints, filterHintEntries, matchCommand, mergeCommandEntries, matchAvailableCommand, useCommandVersion } from './input/commands.ts'
import { hintArgsFor } from './chrome/hint-service.ts'
import type { CommandAvailability, CommandDef } from './input/commands.ts'
import { CHROME_MARGIN_X, MESSAGE_INPUT_GAP_ROWS, hintBlockTop } from '../core/metrics.ts'
import { useComposer } from './input/use-composer.ts'
import type { ComposerSubmission } from './input/composer-fields.ts'
import { seedAsyncListCache } from './hooks/use-async-list.ts'
import { Region } from './region.tsx'
import { MessageList } from './message/message-list.tsx'
import { CloseGuardContext } from './dialog/dialog.tsx'
import type { DialogHandle } from './dialog/dialog.tsx'
import { registerBuiltinWindows } from './windows-builtin.tsx'
import { registerWindowServices, registerTodosService } from './window-services-bridge.ts'
import { useAvailableWindows } from './use-available-windows.ts'
import { padToWidth, textWidth, truncate } from '../core/text.ts'
import type { ActivePanel, InteractionStore } from '../chat/interactions.ts'
import type { PanelPointerHandle } from './panels/surface.tsx'
import { registerBuiltinPanels } from './panels-builtin.tsx'
import { isTodoActive, todoProgress } from '../chat/todo-view.ts'
import type { TodoItemLike } from '../chat/todo-view.ts'
import { useOverlayStack } from './overlay.ts'
import { handleKeyContributions } from './keymap.ts'
import { StatusBar } from './chrome/status-bar.tsx'

const FORCE_EXIT_DELAY_MS = 6000
const INTERRUPT_ARM_MS = 3000

const noopSubscribe = () => () => {}
const nullSnapshot = () => null

function useActivePanel(interactions: InteractionStore | undefined): ActivePanel | null {
  return useSyncExternalStore(
    interactions?.subscribe ?? noopSubscribe,
    interactions?.getSnapshot ?? nullSnapshot,
  )
}

interface AppProps {
  bridge?: ChatBridge
  screen?: ScreenCapture
  themeTick?: number
}

export function App({ bridge, screen, themeTick = 0 }: AppProps) {
  const { columns, rows } = useTerminalSize()
  const overlays = useOverlayStack<string>()
  const dialog: string | null = overlays.top ?? null
  const [, setSessionTick] = useState(0)
  const { messages, modelName, setModelName, updateMessages, resetChat, activity, todos, retryStatus, streamedChars, registryCommands } = useChatEvents(bridge, dialog !== null)
  const windows = useAvailableWindows()
  useEffect(() => {
    if (bridge === undefined) return
    const offServices = registerWindowServices(bridge)
    const offPanels = registerBuiltinPanels({ bridge })
    const offWindows = registerBuiltinWindows({
      onModelSelected: (_provider, model) => setModelName(model),
      onAddProvider: () => {
        overlays.pop()
        overlays.push('providers')
      },
      onBeforeSessionSelected: () => {
        resetChat()
        clearSelection()
      },
      onSessionSelected: () => {
        setSessionTick(tick => tick + 1)
        applyScroll(Infinity)
      },
      onNewSession: startNewSession,
    })
    void bridge.listSessions()
      .then(items => seedAsyncListCache('sessions', items))
      .catch(() => {})
    return () => {
      offWindows()
      offPanels()
      offServices()
    }
  }, [bridge])
  useEffect(() => {
    return registerTodosService(todos)
  }, [todos])
  const todoActive = isTodoActive(todos)
  const todoBadge = todoProgress(todos)
  const running = activity.running
  const dialogRef = useRef<DialogHandle | null>(null)
  const inputRef = useRef<InputBarHandle | null>(null)
  const panelHandleRef = useRef<PanelPointerHandle | null>(null)
  const exiting = useRef(false)
  const sendRef = useRef<(submission: ComposerSubmission) => void>(() => {})
  const isCommandAvailable = useCallback<CommandAvailability>(
    command => command.id !== 'todo' || todoActive,
    [todoActive],
  )
  const [uiTick, setUiTick] = useState(0)
  const busy = running || activity.compacting
  useEffect(() => {
    if (!busy) return
    setUiTick(0)
    const timer = setInterval(() => setUiTick(tick => tick + 1), 100)
    return () => clearInterval(timer)
  }, [busy])
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
  const overlayContribution = useOverlayContribution(dialog)
  const [panelHeight, setPanelHeight] = useState(7)
  const composerInteractive = dialog === null && panel === null
  const commandVersion = useCommandVersion()
  const windowCommands = useMemo(
    () => {
      const staticNames = new Set(COMMANDS.map(command => command.command))
      return windows
        .filter(contribution => contribution.command !== undefined && !staticNames.has(`/${contribution.command.name}`))
        .map(contribution => ({ id: contribution.id, command: `/${contribution.command!.name}`, description: contribution.command!.description }))
    },
    [windows],
  )
  const commandEntries = useMemo(
    () => mergeCommandEntries([...COMMANDS.filter(isCommandAvailable), ...windowCommands], registryCommands),
    [isCommandAvailable, windowCommands, registryCommands, commandVersion],
  )
  const registryNames = useMemo(
    () => new Set(registryCommands.map(entry => `/${entry.name}`)),
    [registryCommands],
  )
  const permissionPresetsRef = useRef<string[] | undefined>(undefined)
  const listCommandArgs = useCallback(async (name: string): Promise<string[]> => {
    // Plugin providers run first; builtins (registry hints, known args,
    // permission presets) act as the fallback chain.
    const contributed = await hintArgsFor(name, () => [])
    if (contributed.length > 0) return contributed
    const registered = commandArgHints(name)
    if (registered !== undefined) return [...registered]
    const known = KNOWN_COMMAND_ARGS[name]
    if (known !== undefined) return [...known]
    if (name !== 'permission') return []
    const cached = permissionPresetsRef.current
    if (cached !== undefined) return [...cached]
    const list = await bridge?.listPermissionPresets?.() ?? []
    permissionPresetsRef.current = list
    return list
  }, [bridge])
  const { value, cursor, hintOpen, commandIndex, api } = useComposer(
    submission => sendRef.current(submission),
    composerInteractive,
    contentWidth,
    () => bridge?.cyclePermission(),
    commandEntries,
    listCommandArgs,
  )
  const commands = useMemo(() => filterHintEntries(commandEntries, value), [commandEntries, value])
  const layout = inputLayout(value, cursor, columns)
  const permissionMode = bridge?.permissionMode() ?? 'workspace-write'
  const permissionChrome = permissionModeInfo(permissionMode)
  const bottomHeight = panel === null ? layout.barHeight : panelHeight + 1
  const inputHeight = bottomHeight
  const messageHeight = Math.max(1, rows - inputHeight - MESSAGE_INPUT_GAP_ROWS)
  const total = rowIndexFor(messages, columns).total
  const { scrollTop, applyScroll, getScroll } = useScroll(total, messageHeight, messages)
  const startNewSession = () => {
    if (!bridge) return
    resetChat()
    clearSelection()
    applyScroll(Infinity)
    void Promise.resolve(bridge.newSession())
      .then(() => setSessionTick(tick => tick + 1))
      .catch(() => {})
  }
  const runCommand = (def: CommandDef) => {
    if (def.run !== undefined) {
      def.run()
      return
    }
    switch (def.id) {
      case 'new':
        startNewSession()
        return
      case 'todo':
        if (bridge && todoActive) overlays.push('todo')
        return
      default:
        if (bridge) overlays.push(def.id)
        return
    }
  }
  const handleSend = (submission: ComposerSubmission) => {
    const text = submission.text
    const matched = matchAvailableCommand(text, isCommandAvailable, windowCommands)
    if (matched !== undefined) {
      runCommand(matched)
      return
    }
    if (matchCommand(text) !== undefined) return
    if (registryNames.has(text.split(/\s+/, 1)[0] ?? '')) {
      void bridge?.executeCommandLine(text)
      applyScroll(Infinity)
      return
    }
    bridge?.send(submission.text, submission.images)
    applyScroll(Infinity)
  }
  sendRef.current = handleSend
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
  const hintIndexAt = (y: number): number | undefined => {
    const region = hintRegion(rows, hintState, dialog !== null, inputHeight)
    if (region === null || hintState === null) return undefined
    if (y < region.top || y > region.bottom) return undefined
    const index = (hintState.startIndex ?? 0) + (y - region.top)
    if (index < 0 || index >= commandEntries.length) return undefined
    return index
  }
  const hintPendingPick = useRef<number | null>(null)
  const handleHintPress = (_x: number, y: number): void => {
    hintPendingPick.current = hintIndexAt(y) ?? null
  }
  const handleHintDragStart = (x: number, y: number): void => {
    setSelection({ anchorRow: y, anchorCol: x, focusRow: y, focusCol: x, inMessage: false })
  }
  const handleHintDragMove = (x: number, y: number): void => {
    setSelection(current => current === null || current.inMessage ? current : { ...current, focusRow: y, focusCol: x })
  }
  const handleHintRelease = (_x: number, _y: number, dragged: boolean): void => {
    if (!dragged && hintPendingPick.current !== null) {
      inputRef.current?.hintPick(hintPendingPick.current)
    }
    hintPendingPick.current = null
  }
  const selectionRef = useRef<LineSelection | null>(null)
  const { selection, messageAreaSelection, chromeSelection, setSelection, clearSelection } = useMouseSelection({
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
    getScroll,
    onHintPress: handleHintPress,
    onHintDragStart: handleHintDragStart,
    onHintDragMove: handleHintDragMove,
    onHintRelease: handleHintRelease,
    onDialogWheel: (y, dir) => dialogRef.current?.wheelAt(y, dir) === true,
    onScroll: applyScroll,
    onToggleMessage: handleToggle,
    onDialogClick: (y, x) => dialogRef.current?.clickAt(y, x),
  })
  selectionRef.current = selection
  useInput((input, key) => {
    if (isKeyConsumed() && !(key.ctrl && input === 'c' && selection !== null)) return
    if (dialog !== null && !selection) return
    if (key.escape) {
      if (hintOpen) return
      if (panel === null && busy && bridge !== undefined) {
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
        const text = copySelection(selection, {
          messageText: sel => selectionText(messages, columns, sel),
          chromeText: sel => chromeSelectionText(sel),
        })
        if (text) writeClipboardText(text)
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
        <KeymapGate />
        <MessageList
          messages={messages}
          height={messageHeight}
          width={columns}
          scrollTop={scrollTop}
          onScroll={applyScroll}
          interactive={dialog === null}
          themeTick={themeTick}
          spinnerTick={busy ? uiTick : 0}
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
          {panel !== null && bridge !== undefined && (() => {
            const contribution = bridge.interactions.panels.of(panel.kind)
            if (contribution === undefined) return null
            const Panel = contribution.component
            const request = panel.kind === 'approval'
              ? { approval: panel.approval }
              : panel.kind === 'question'
                ? { question: panel.question }
                : panel.request
            const key = panel.kind === 'approval'
              ? `approval-${panel.approval?.id ?? ''}`
              : panel.kind === 'question'
                ? `question-${panel.question?.id ?? ''}`
                : panel.kind
            return (
              <Panel
                key={key}
                request={request}
                resolve={value => {
                  if (panel.kind === 'approval') panel.settle?.(value)
                  else panel.resolve?.(value)
                }}
                reject={cause => {
                  if (panel.kind === 'approval') panel.settle?.('cancelled')
                  else panel.reject?.(cause)
                }}
                active={dialog === null}
                columns={columns}
                rows={rows}
                innerWidth={contentWidth}
                blockWidth={contentWidth + 4}
                background={permissionChrome.color}
                handleRef={panelHandleRef}
                onResize={setPanelHeight}
              />
            )
          })()}
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
                  const leftWidth = Math.max(1, Math.floor((blockWidth * 2) / 5))
                  const label = command.hint === undefined ? command.command : `${command.command} ${command.hint}`
                  const labelPiece = truncate(label, leftWidth - 1)
                  const descriptionPiece = truncate(command.description, Math.max(1, blockWidth - leftWidth - 2))
                  const gap = Math.max(1, leftWidth - textWidth(labelPiece))
                  const trail = Math.max(0, blockWidth - 2 - leftWidth - textWidth(descriptionPiece))
                  return (
                    <Box key={command.command} width={blockWidth} backgroundColor={COLORS.dialogBackground}>
                      <Box flexDirection="row">
                        <Text inverse={selected} color={COLORS.ink}>{'  '}</Text>
                        <SelectableText y={index} col={CHROME_MARGIN_X + 2} text={labelPiece} inverse={selected} />
                        <Text inverse={selected} color={COLORS.ink}>{' '.repeat(gap)}</Text>
                        <SelectableText y={index} col={CHROME_MARGIN_X + 2 + leftWidth} text={descriptionPiece} inverse={selected} />
                        <Text inverse={selected} color={COLORS.ink}>{' '.repeat(trail)}</Text>
                      </Box>
                    </Box>
                  )
                })}
              </Region>
            </Box>
          )}
          {bridge !== undefined && (
            <StatusBar
              bridge={bridge}
              columns={columns}
              top={rows - 1}
              busy={busy}
              running={running}
              todoBadge={todoBadge}
              activity={activity}
              panel={panel}
              retryStatus={retryStatus}
              escArmed={escArmed}
              uiTick={uiTick}
              streamedChars={streamedChars}
            />
          )}
        </SelectionContext.Provider>
      {dialog !== null && (() => {
        const entry = windows.find(candidate => candidate.id === dialog)
        if (entry !== undefined && bridge !== undefined) {
          const Window = entry.component
          return (
            <CloseGuardContext.Provider value={selection !== null}>
              <SelectionContext.Provider value={chromeSelection}>
                <Window open handleRef={dialogRef} onClose={() => overlays.pop()} />
              </SelectionContext.Provider>
            </CloseGuardContext.Provider>
          )
        }
        const overlay = overlayContribution
        if (overlay !== undefined) {
          return <Region>{overlay.render({ onClose: () => overlays.pop() })}</Region>
        }
        return null
      })()}
      </Box>
    </SelectionContext.Provider>
  )
}