import { Box, Text, useInput } from 'ink'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { permissionModeInfo, setDialogDimmed, COLORS } from '../theme.ts'
import { setHoveredMessage } from './message/hover.ts'
import { EARLIER_MESSAGE_ID } from '../chat/store.ts'
import { writeClipboardText } from '../terminal/clipboard.ts'
import { copySelection } from './selection/service.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type { AgentActivity } from '../chat/store.ts'
import { rowIndexFor, selectionText } from './message/layout.ts'
import { glyphs } from '../terminal/glyphs.ts'
import { restoreAllModes } from '../terminal/modes.ts'
import { chromeSelectionText } from './selection-registry.ts'
import type { ScreenCapture } from '../terminal/screen.ts'
import type { LineSelection } from '../model/selection.ts'
import { SelectionContext, DialogPaletteContext } from './selection.tsx'
import { useTerminalSize } from './hooks/use-terminal-size.ts'
import { useBootState } from '../boot-log.ts'
import { useChatEvents } from './hooks/use-chat-events.ts'
import { useScroll } from './hooks/use-scroll.ts'
import { useMouseSelection, hintRegion } from './hooks/use-mouse-selection.ts'
import { isKeyConsumed } from './key-arbiter.ts'
import { KeymapGate } from './chrome/key-gate.tsx'
import { useOverlayContribution } from './contributions.ts'
import { InputBar, inputLayout, INPUT_WIDTH_OFFSET, HINT_MAX_ROWS } from './input/input-bar.tsx'
import type { InputBarHandle } from './input/input-bar.tsx'
import { COMMANDS, KNOWN_COMMAND_ARGS, commandArgHints, commandHintArgs, filterHintEntries, matchCommand, mergeCommandEntries, matchAvailableCommand, useCommandVersion } from './input/commands.ts'
import { hintArgsFor } from './chrome/hint-service.ts'
import type { CommandAvailability, CommandDef } from './input/commands.ts'
import { localizeText, useLanguage } from '../core/language.ts'
import { MESSAGE_INPUT_GAP_ROWS } from '../core/metrics.ts'
import { useComposer } from './input/use-composer.ts'
import type { ComposerSubmission } from './input/composer-fields.ts'
import { DELIVERY_MODE_KINDS } from './input/composer-fields.ts'
import { registerFieldKind } from '../core/fields.ts'
import { useDeliveryMode } from '../core/delivery.ts'
import { Region } from './region.tsx'
import { MessageList } from './message/message-list.tsx'
import { SpinnerTickProvider } from './spinner-tick.tsx'
import { CloseGuardContext } from './dialog/dialog.tsx'
import type { DialogHandle } from './dialog/dialog.tsx'
import { registerBuiltinWindows } from './windows-builtin.tsx'
import { BootWarningStrip, dismissBootWarnings } from './boot-notices.tsx'
import { registerWindowServices, registerTodosService } from './window-services-bridge.ts'
import { useAvailableWindows } from './use-available-windows.ts'
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

/**
 * Style the busy-Enter delivery chips. `fieldStyleOf` reads the live palette,
 * so the chip follows a theme switch without re-registering.
 */
function registerDeliveryFieldKinds(): () => void {
  const style = () => ({ color: COLORS.deliveryChipText, background: COLORS.deliveryChipBackground, bold: true })
  const dispose = [registerFieldKind({ kind: DELIVERY_MODE_KINDS.interrupt, style }), registerFieldKind({ kind: DELIVERY_MODE_KINDS.queue, style })]
  return () => {
    for (const off of dispose) off()
  }
}

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
  /** Unmount the ink root; the Ctrl-C path must stop all rendering before restoring terminal modes. */
  onForceExit?: () => void
}

export function App({ bridge, screen, themeTick = 0, onForceExit }: AppProps) {
  const { columns, rows } = useTerminalSize()
  const overlays = useOverlayStack<string>()
  const dialog: string | null = overlays.top ?? null
  const dialogOpen = dialog !== null
  useEffect(() => {
    setDialogDimmed(dialogOpen)
    if (dialogOpen) setHoveredMessage('')
  }, [dialogOpen])
  const [, setSessionTick] = useState(0)
  const { messages, archiveCount, loadEarlier, modelName, setModelName, updateMessages, resetChat, activity, stepBoundary, todos, retryStatus, streamedChars, registryCommands } = useChatEvents(bridge, dialog !== null, columns)
  const boot = useBootState()
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
    // A failed prewarm only delays the roster; onSessionListChanged repaints it when ready.
    void bridge.listSessions().catch(() => {})
    return () => {
      offWindows()
      offPanels()
      offServices()
    }
  }, [bridge])
  useEffect(() => {
    return registerTodosService(todos)
  }, [todos])
  useEffect(() => registerDeliveryFieldKinds(), [])
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
  const busy = running || activity.compacting
  // Busy ticks live in App state so every tick re-renders the composer: ink
  // only writes the hardware-cursor suffix on frames where setCursorPosition
  // ran, and skipping the composer parks the caret on the frame's bottom row.
  const [uiTick, setUiTick] = useState(0)
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
  const language = useLanguage()
  const windowCommands = useMemo(
    () => {
      const staticNames = new Set(COMMANDS.map(command => command.command))
      return windows
        .filter(contribution => contribution.command !== undefined && !staticNames.has(`/${contribution.command.name}`))
        .map(contribution => ({ id: contribution.id, command: `/${contribution.command!.name}`, description: contribution.command!.description, descriptions: contribution.command!.descriptions }))
    },
    [windows],
  )
  const commandEntries = useMemo(
    () => mergeCommandEntries([...COMMANDS.filter(isCommandAvailable), ...windowCommands], registryCommands, language),
    [isCommandAvailable, windowCommands, registryCommands, commandVersion, language],
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
  const deliveryMode = useDeliveryMode()
  const { value, cursor, hintOpen, commandIndex, api, pendingMode } = useComposer(
    submission => sendRef.current(submission),
    composerInteractive,
    contentWidth,
    () => bridge?.cyclePermission(),
    commandEntries,
    listCommandArgs,
    () => (busy ? deliveryMode : null),
  )
  // A pending delivery releases when the running turn (queue) or the current
  // step (interrupt) finishes. The boundary is captured when the chip is armed
  // so an interrupt fires on the next step end, not on every later render.
  const armedStepRef = useRef(0)
  const hadPendingRef = useRef(false)
  useEffect(() => {
    if (pendingMode !== null && !hadPendingRef.current) armedStepRef.current = stepBoundary
    hadPendingRef.current = pendingMode !== null
  }, [pendingMode, stepBoundary])
  useEffect(() => {
    if (pendingMode === null) return
    const released = pendingMode === 'queue' ? !busy : !busy || stepBoundary > armedStepRef.current
    if (released) api.commit()
  }, [pendingMode, busy, stepBoundary, api])
  const commands = useMemo(() => filterHintEntries(commandEntries, value), [commandEntries, value])
  // The parameter strip owns the slot once a parameterized command is typed
  // out; the command menu has already closed by then, so only one is ever set.
  const hintArgs = dialog === null && commands.length === 0 ? commandHintArgs(commandEntries, value) ?? null : null
  const argRows = hintArgs === null ? 0 : 1
  const layout = inputLayout(value, cursor, columns)
  const permissionMode = bridge?.permissionMode() ?? 'workspace-write'
  const permissionChrome = permissionModeInfo(permissionMode)
  const bottomHeight = panel === null ? layout.barHeight : panelHeight + 1
  const inputHeight = bottomHeight
  const messageHeight = Math.max(1, rows - inputHeight - MESSAGE_INPUT_GAP_ROWS - argRows)
  const total = rowIndexFor(messages, columns).total
  const { scrollTop, applyScroll, getScroll, expandTop } = useScroll(total, messageHeight)
  const startNewSession = () => {
    if (!bridge) return
    resetChat()
    clearSelection()
    applyScroll(Infinity)
    void Promise.resolve(bridge.newSession())
      .then(() => setSessionTick(tick => tick + 1))
      .catch(() => {
        // The session list stays on the old agent; the next newSession attempt retries.
      })
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
    bridge?.send(submission.text, submission.images, submission.mode)
    applyScroll(Infinity)
  }
  sendRef.current = handleSend
  const showHint = dialog === null && hintOpen && commands.length > 0
  const maxVisible = Math.max(1, Math.min(HINT_MAX_ROWS, rows - inputHeight - 1))
  const hintPrevIndexRef = useRef(0)
  const hintDir: -1 | 1 = showHint && commandIndex !== hintPrevIndexRef.current
    ? commandIndex > hintPrevIndexRef.current ? 1 : -1
    : 1
  const hintAnchor = hintDir === 1 ? Math.floor(maxVisible / 2) : Math.floor((maxVisible - 1) / 2)
  const hintVisibleStart = Math.max(0, Math.min(commandIndex - hintAnchor, Math.max(0, commands.length - maxVisible)))
  // The previous index is read during render but written after commit: a
  // render-phase ref write is unsafe under concurrent re-renders.
  useEffect(() => {
    hintPrevIndexRef.current = commandIndex
  }, [commandIndex])
  const hintState = showHint
    ? {
        commands: commands.slice(hintVisibleStart, hintVisibleStart + maxVisible),
        selectedIndex: commandIndex - hintVisibleStart,
        startIndex: hintVisibleStart,
        nameWidth: Math.max(...commands.map(entry => entry.command.length)),
      }
    : null
  const handleToggle = (id: string) => {
    if (id === EARLIER_MESSAGE_ID) {
      handleLoadEarlier()
      return
    }
    updateMessages(current => current.map(message =>
      (message.kind === 'collapsible' || message.kind === 'tool-card') && message.id === id
        ? { ...message, collapsed: !(message.collapsed ?? true) }
        : message,
    ))
  }
  const handleLoadEarlier = (): void => {
    expandTop(loadEarlier())
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
    dialogHandle: dialogRef,
    onScroll: applyScroll,
    onToggleMessage: handleToggle,
    onDialogClick: (y, x) => dialogRef.current?.clickAt(y, x),
  })
  selectionRef.current = selection
  useInput((input, key) => {
    if (isKeyConsumed() && !(key.ctrl && input === 'c' && selection !== null)) return
    if (dialog !== null && !selection) return
    if (key.ctrl && input === 'w' && boot.warnings.length > 0) {
      dismissBootWarnings()
      return
    }
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
          chromeText: sel => dialogRef.current?.copySelection?.(sel) ?? chromeSelectionText(sel),
        })
        if (text) writeClipboardText(text)
        clearSelection()
        return
      }
      if (!exiting.current) {
        exiting.current = true
        // Unmount ink before touching modes: every frame written after the
        // alt-screen exit lands in the primary buffer (WSL flushes the writes
        // that Windows drops), so the shell screen stays clean only when
        // nothing can render anymore.
        onForceExit?.()
        // Restore every terminal mode synchronously before signaling: on
        // Windows the queued async writes of the dispose path can be lost
        // at exit, and the console input mode (raw/VT) persists for the
        // next process attached to this console.
        restoreAllModes()
        try {
          process.stdin.setRawMode(false)
          process.stdin.pause()
        } catch {
          // stdin is not a TTY (piped input); there is no mode to restore.
        }
        process.kill(process.pid, 'SIGINT')
        setTimeout(() => process.exit(0), FORCE_EXIT_DELAY_MS).unref()
      }
    }
  })
  return (
    <SpinnerTickProvider tick={busy ? uiTick : 0}>
      <SelectionContext.Provider value={messageAreaSelection}>
        <Box flexDirection="column" width={columns} height={rows}>
          <KeymapGate />
          {boot.warnings.length > 0 && <BootWarningStrip />}
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
                hint={hintState}
                args={hintArgs}
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
                streamedChars={streamedChars}
              />
            )}
          </SelectionContext.Provider>
          {dialog !== null && (
            <DialogPaletteContext.Provider value={true}>
              {(() => {
                const entry = windows.find(candidate => candidate.id === dialog)
                if (entry !== undefined && bridge !== undefined) {
                  const Window = entry.component
                  return (
                    <CloseGuardContext.Provider value={selection !== null}>
                      <SelectionContext.Provider value={chromeSelection}>
                        <Window open title={localizeText(entry.title, undefined, language)} handleRef={dialogRef} onClose={() => overlays.pop()} />
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
            </DialogPaletteContext.Provider>
          )}
        </Box>
      </SelectionContext.Provider>
    </SpinnerTickProvider>
  )
}