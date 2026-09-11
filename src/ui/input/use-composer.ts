import { useInput, usePaste } from 'ink'
import { isKeyConsumed } from '../key-arbiter.ts'
import { useEffect, useRef, useState } from 'react'
import { isMouseResidue } from '../../terminal/mouse.ts'
import { colToCharIndex } from '../../core/text.ts'
import { moveCaretLine } from '../../core/composer-layout.ts'
import { editBackspace, editCursorLeft, editCursorRight, editCursorWordLeft, editCursorWordRight, editDelete, editDeleteWordLeft, editDeleteWordRight, editInsert } from '../../core/edit.ts'
import type { EditState } from '../../core/edit.ts'
import { buildPasteFields, deliveryFieldOf, expandComposerValue, insertClipboardImage, insertDeliveryModeField, insertFieldSpec, reconcileComposerFields, removeDeliveryModeField } from './composer-fields.ts'
import type { ComposerFieldMap, ComposerSubmission, DeliveryMode } from './composer-fields.ts'
import { sanitizePastedText } from '../../core/paste.ts'
import { readClipboardImage, readClipboardImageUris, readClipboardText } from '../../terminal/clipboard.ts'
import { claimPaste } from './composer-paste.ts'
import { handleComposerKeyBindings } from './composer-keys.ts'
import { setComposerInserter } from './composer-bus.ts'
import { filterHintEntries, literalHintArgs, nextHintCompletion } from './commands.ts'
import type { CommandHintItem } from './commands.ts'

export interface ComposerState {
  value: string
  cursor: number
  hintOpen: boolean
  commandIndex: number
  api: ComposerApi
  /** Delivery mode of the chip currently in the buffer, or null when there is none. */
  pendingMode: DeliveryMode | null
}

export interface ComposerApi {
  moveLineBy(delta: -1 | 1): void
  placeCursor(charIndex: number): void
  selectHint(absoluteIndex: number): void
  confirmHint(): void
  hintMove(delta: -1 | 1): void
  hintClickAt(absoluteIndex: number): void
  hintPick(absoluteIndex: number): void
  /**
   * Submit the current buffer through the same path as Enter and clear it.
   * Returns false when there is nothing to send.
   */
  commit(): boolean
  /** Drop a pending delivery chip and its buffer without sending anything. */
  dismissPending(): void
}

function opensHint(text: string): boolean {
  return text.startsWith('/') && !/\s/.test(text)
}

const UNDO_LIMIT = 200

export function useComposer(
  onSend: (submission: ComposerSubmission) => void,
  interactive: boolean,
  contentWidth: number,
  onCycleMode?: () => void,
  entries?: readonly CommandHintItem[],
  listCommandArgs?: (name: string) => Promise<string[]>,
  /** Delivery mode for a plain Enter while the agent is busy; null while idle. */
  busyMode?: () => DeliveryMode | null,
): ComposerState {
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [commandIndex, setCommandIndex] = useState(0)
  const valueRef = useRef('')
  const cursorRef = useRef(0)
  const hintOpenRef = useRef(false)
  const commandIndexRef = useRef(0)
  const widthRef = useRef(contentWidth)
  const entriesRef = useRef<readonly CommandHintItem[] | undefined>(entries)
  const listCommandArgsRef = useRef(listCommandArgs)
  const interactiveRef = useRef(interactive)
  const fieldsRef = useRef<ComposerFieldMap>(new Map())
  const busyModeRef = useRef(busyMode)
  /** Delivery mode carried by the chip in the buffer, or null when there is none. */
  const [pendingMode, setPendingMode] = useState<DeliveryMode | null>(null)
  const pendingModeRef = useRef<DeliveryMode | null>(null)
  widthRef.current = contentWidth
  entriesRef.current = entries
  listCommandArgsRef.current = listCommandArgs
  interactiveRef.current = interactive
  busyModeRef.current = busyMode
  valueRef.current = value
  cursorRef.current = cursor
  hintOpenRef.current = hintOpen
  commandIndexRef.current = commandIndex
  pendingModeRef.current = pendingMode
  const visibleFor = (text: string) => filterHintEntries(entriesRef.current ?? [], text)
  const undoStackRef = useRef<EditState[]>([])
  const redoStackRef = useRef<EditState[]>([])
  const pushUndoSnapshot = (): void => {
    resetHistoryBrowse()
    undoStackRef.current.push({ value: valueRef.current, cursor: cursorRef.current })
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift()
    redoStackRef.current.length = 0
  }
  /**
   * Re-derive the pending mode from the buffer, which is the single source of
   * truth. Any edit that drops the chip char (backspace, delete, cut, undo) ends
   * the waiting/interrupt event with it; the chip is not re-added while the
   * agent stays busy, so the toggle-off sticks.
   */
  const syncPendingFromBuffer = (): void => {
    if (pendingModeRef.current === null) return
    if (deliveryFieldOf(valueRef.current, fieldsRef.current) === undefined) {
      pendingModeRef.current = null
      setPendingMode(null)
    }
  }
  const applySnapshot = (next: EditState): void => {
    valueRef.current = next.value
    cursorRef.current = next.cursor
    setValue(next.value)
    setCursor(next.cursor)
    reconcileComposerFields(next.value, fieldsRef.current)
    syncPendingFromBuffer()
  }
  const applyEdit = (next: EditState | null): void => {
    if (next === null) return
    pushUndoSnapshot()
    applySnapshot(next)
  }
  const clearComposer = (): void => {
    fieldsRef.current = new Map()
    valueRef.current = ''
    cursorRef.current = 0
    setValue('')
    setCursor(0)
    setPendingMode(null)
    pendingModeRef.current = null
    undoStackRef.current.length = 0
    redoStackRef.current.length = 0
    closeHint()
  }
  /** Send the current buffer and clear it. Returns false when there is nothing to send. */
  const commit = (): boolean => {
    const submission = expandComposerValue(valueRef.current, fieldsRef.current)
    const hasContent = submission.text !== '' || submission.images.length > 0
    if (hasContent) recordHistoryEntry(submission.text)
    clearComposer()
    if (hasContent) onSend(submission)
    return hasContent
  }
  /**
   * Enter the busy delivery mode: append the chip once. An existing chip is
   * replaced in place when the mode changes, and nothing happens when the
   * buffer already carries this mode or a previous edit removed it.
   */
  const applyPendingMode = (mode: DeliveryMode | null): void => {
    if (mode === null || mode === pendingModeRef.current) return
    const next = insertDeliveryModeField(valueRef.current, fieldsRef.current, mode)
    if (next === undefined) return
    pendingModeRef.current = mode
    setPendingMode(mode)
    valueRef.current = next
    cursorRef.current = next.length
    setValue(next)
    setCursor(next.length)
  }
  /** Remove the chip char from the buffer and clear the mode, without setState. */
  const dismissPendingSync = (): string => {
    const next = removeDeliveryModeField(valueRef.current, fieldsRef.current)
    pendingModeRef.current = null
    setPendingMode(null)
    valueRef.current = next
    return next
  }
  /** Drop the chip and its event, keeping the rest of the buffer. */
  const dismissPending = (): void => {
    if (pendingModeRef.current === null) return
    const next = dismissPendingSync()
    cursorRef.current = Math.min(cursorRef.current, next.length)
    setValue(next)
    setCursor(cursorRef.current)
  }
  const undoEdit = (): void => {
    const snapshot = undoStackRef.current.pop()
    if (snapshot === undefined) return
    redoStackRef.current.push({ value: valueRef.current, cursor: cursorRef.current })
    if (redoStackRef.current.length > UNDO_LIMIT) redoStackRef.current.shift()
    applySnapshot(snapshot)
    refreshHint()
  }
  const redoEdit = (): void => {
    const snapshot = redoStackRef.current.pop()
    if (snapshot === undefined) return
    undoStackRef.current.push({ value: valueRef.current, cursor: cursorRef.current })
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift()
    applySnapshot(snapshot)
    refreshHint()
  }
  const HISTORY_LIMIT = 50
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const historyDraftRef = useRef<EditState | null>(null)
  const resetHistoryBrowse = (): void => {
    historyIndexRef.current = -1
    historyDraftRef.current = null
  }
  const historyOlder = (): void => {
    const history = historyRef.current
    if (history.length === 0) return
    if (historyIndexRef.current === -1) {
      historyDraftRef.current = { value: valueRef.current, cursor: cursorRef.current }
      historyIndexRef.current = 0
    } else if (historyIndexRef.current >= history.length - 1) {
      return
    } else {
      historyIndexRef.current += 1
    }
    const entry = history[history.length - 1 - historyIndexRef.current]!
    applySnapshot({ value: entry, cursor: entry.length })
    closeHint()
  }
  const historyNewer = (): void => {
    if (historyIndexRef.current === -1) return
    if (historyIndexRef.current === 0) {
      const draft = historyDraftRef.current
      resetHistoryBrowse()
      applySnapshot(draft ?? { value: '', cursor: 0 })
      closeHint()
      return
    }
    historyIndexRef.current -= 1
    const entry = historyRef.current[historyRef.current.length - 1 - historyIndexRef.current]!
    applySnapshot({ value: entry, cursor: entry.length })
    closeHint()
  }
  const recordHistoryEntry = (text: string): void => {
    resetHistoryBrowse()
    if (text === '') return
    const history = historyRef.current
    if (history[history.length - 1] === text) return
    history.push(text)
    if (history.length > HISTORY_LIMIT) history.shift()
  }
  const closeHint = (): void => {
    setHintOpen(false)
    hintOpenRef.current = false
    setCommandIndex(0)
    commandIndexRef.current = 0
  }
  const openHint = (): void => {
    setHintOpen(true)
    hintOpenRef.current = true
    setCommandIndex(0)
    commandIndexRef.current = 0
  }
  const refreshHint = (): void => {
    if (opensHint(valueRef.current)) openHint()
    else closeHint()
  }
  const applyEditAndRefreshHint = (next: { value: string; cursor: number } | null): boolean => {
    if (next === null) return false
    applyEdit(next)
    refreshHint()
    return true
  }
  const apiRef = useRef<ComposerApi>({
    moveLineBy(delta) {
      const next = moveCaretLine(valueRef.current, cursorRef.current, widthRef.current, delta)
      cursorRef.current = next
      setCursor(next)
    },
    placeCursor(charIndex) {
      const clamped = Math.max(0, Math.min(charIndex, valueRef.current.length))
      cursorRef.current = clamped
      setCursor(clamped)
    },
    selectHint(absoluteIndex) {
      const commands = visibleFor(valueRef.current)
      const clamped = Math.max(0, Math.min(absoluteIndex, commands.length - 1))
      commandIndexRef.current = clamped
      setCommandIndex(clamped)
    },
    confirmHint() {
      const commands = visibleFor(valueRef.current)
      if (commands.length === 0) return
      const command = commands[Math.min(commandIndexRef.current, commands.length - 1)]?.command
      if (command === undefined) return
      const completed = `${command} `
      pushUndoSnapshot()
      valueRef.current = completed
      cursorRef.current = completed.length
      setValue(completed)
      setCursor(completed.length)
      closeHint()
    },
    hintMove(delta) {
      const commands = visibleFor(valueRef.current)
      if (commands.length === 0) return
      const next = (commandIndexRef.current + delta + commands.length) % commands.length
      commandIndexRef.current = next
      setCommandIndex(next)
    },
    hintClickAt(absoluteIndex) {
      if (!hintOpenRef.current) return
      if (absoluteIndex === commandIndexRef.current) {
        apiRef.current.confirmHint()
        return
      }
      apiRef.current.selectHint(absoluteIndex)
    },
    hintPick(absoluteIndex) {
      if (!hintOpenRef.current) return
      apiRef.current.selectHint(absoluteIndex)
      apiRef.current.confirmHint()
    },
    commit,
    dismissPending,
  })
  const insertPaste = (normalized: string): void => {
    const sanitized = sanitizePastedText(normalized)
    if (sanitized === '') return
    const { value: current, cursor: at } = { value: valueRef.current, cursor: cursorRef.current }
    const inserted = buildPasteFields(sanitized, fieldsRef.current)
    applyEdit(editInsert({ value: current, cursor: at }, inserted))
    refreshHint()
  }
  const upgradeFirstImageGroupFromClipboard = async (): Promise<void> => {
    const entries = [...fieldsRef.current.entries()]
    const imageFields = entries.filter(([, field]) => field.kind === 'image')
    if (imageFields.length !== 1) return
    const [, field] = imageFields[0]!
    const pathCount = (field.images ?? []).filter(image => image.kind === 'path').length
    if (pathCount !== 1) return
    try {
      const uris = await readClipboardImageUris()
      if (uris.length > 1) field.images = uris.map(path => ({ kind: 'path' as const, path }))
    } catch {
      // Clipboard URI lists are best-effort; a single pasted path stays as-is.
    }
  }
  const pasteFromClipboard = async (allowText: boolean): Promise<void> => {
    try {
      const image = await readClipboardImage()
      if (image !== undefined) {
        insertPaste(insertClipboardImage(image, fieldsRef.current))
        return
      }
      if (!allowText) return
      const text = await readClipboardText()
      if (text !== undefined && text !== '') insertPaste(text.replace(/\r\n?/g, '\n'))
    } catch {
      // A clipboard backend failure is ignored: the paste simply does not insert.
    }
  }
  usePaste(text => {
    if (!interactive) return
    const normalized = text.replace(/\r\n?/g, '\n')
    if (normalized === '') {
      void pasteFromClipboard(true)
      return
    }
    void (async () => {
      const claimed = claimPaste(normalized, cursorRef.current)
      insertPaste(claimed === undefined ? normalized : claimed.insert)
      if (claimed === undefined) void upgradeFirstImageGroupFromClipboard()
    })()
  }, { isActive: interactive })
  const insertText = (text: string): void => {
    applyEdit(editInsert({ value: valueRef.current, cursor: cursorRef.current }, text))
  }
  useEffect(() => {
    setComposerInserter(spec => {
      if (!interactiveRef.current) return false
      if (spec.field !== undefined) {
        const char = insertFieldSpec(spec.field, fieldsRef.current)
        applyEdit(editInsert({ value: valueRef.current, cursor: cursorRef.current }, char))
        refreshHint()
        return true
      }
      if (spec.text !== undefined && spec.text !== '') {
        applyEdit(editInsert({ value: valueRef.current, cursor: cursorRef.current }, sanitizePastedText(spec.text)))
        refreshHint()
        return true
      }
      return false
    })
    return () => setComposerInserter(undefined)
  }, [])
  const completeCommandArg = (): void => {
    const v = valueRef.current
    const match = /^(\/\S+)(?:\s+(\S*))?(?:\s+(.*\S))?\s*$/.exec(v)
    if (match === null) return
    const commandToken = match[1]!
    const entry = entriesRef.current?.find(candidate => candidate.command === commandToken)
    if (entry === undefined) return
    const currentArg = match[2] ?? ''
    const rest = match[3]
    void (async () => {
      let candidates: string[] = []
      try {
        candidates = await listCommandArgsRef.current?.(entry.command.slice(1)) ?? []
      } catch {
        // An argument provider failure abandons the completion quietly.
        return
      }
      // A provider may resolve after the user kept typing; a stale result must
      // never overwrite the newer buffer.
      if (valueRef.current !== v) return
      if (candidates.length === 0) candidates = literalHintArgs(entry.hint)
      if (candidates.length === 0) return
      const next = nextHintCompletion(candidates, currentArg)
      if (next === undefined) return
      const completed = `${commandToken} ${next}${rest === undefined ? '' : ` ${rest}`}`
      pushUndoSnapshot()
      valueRef.current = completed
      cursorRef.current = completed.length
      setValue(completed)
      setCursor(completed.length)
      closeHint()
    })()
  }
  useInput((input, key) => {
    if (!interactive || isKeyConsumed()) return
    if (handleComposerKeyBindings(input, key)) {
      return
    }
    if (input === '\n') {
      insertText('\n')
      return
    }
    const v = valueRef.current
    const c = cursorRef.current
    // Typing while a chip is pending replaces the buffer with what was typed:
    // the chip's waiting/interrupt event exists only while the chip is there.
    const pendingChip = pendingModeRef.current !== null
    const commands = visibleFor(v)
    const showHint = hintOpenRef.current && commands.length > 0
    if (key.return && !key.shift && showHint) {
      const selected = commands[Math.min(commandIndexRef.current, commands.length - 1)]
      const exactArgless = selected !== undefined && selected.hint === undefined && v === selected.command
      if (!exactArgless) {
        apiRef.current.confirmHint()
        return
      }
    }
    if (key.escape && showHint) {
      closeHint()
      return
    }
    if (key.tab) {
      if (!v.startsWith('/')) {
        onCycleMode?.()
        return
      }
      const lastChar = v.length > 0 ? v[v.length - 1] : undefined
      const completable = c === v.length && lastChar !== undefined && !/\s/.test(lastChar)
      const trailingCommand = c === v.length && /^(\/\S+)\s+$/.test(v)
      const exactCommand = entriesRef.current?.some(entry => entry.command === v) ?? false
      if (completable && exactCommand) {
        completeCommandArg()
        return
      }
      if (showHint) {
        apiRef.current.confirmHint()
        return
      }
      if (completable || trailingCommand) {
        completeCommandArg()
      }
      return
    }
    if (key.upArrow && showHint) {
      const next = (commandIndexRef.current - 1 + commands.length) % commands.length
      commandIndexRef.current = next
      setCommandIndex(next)
      return
    }
    if (key.downArrow && showHint) {
      const next = (commandIndexRef.current + 1) % commands.length
      commandIndexRef.current = next
      setCommandIndex(next)
      return
    }
    if (key.return && !key.shift) {
      const submission = expandComposerValue(v, fieldsRef.current)
      const hasContent = submission.text !== '' || submission.images.length > 0
      // While the agent is busy, a plain message arms the delivery chip instead
      // of sending: the text stays in the buffer until the host flushes it.
      // Commands still dispatch immediately, as they never reach the model.
      const busyMode = hasContent && !submission.text.startsWith('/') ? busyModeRef.current?.() ?? null : null
      if (busyMode !== null) {
        applyPendingMode(busyMode)
        return
      }
      commit()
      return
    }
    if (key.return) {
      insertText('\n')
      return
    }
    if (key.ctrl && input === 'v') {
      void pasteFromClipboard(true)
      return
    }
    if (key.ctrl && input === 'z') {
      if (key.shift) redoEdit()
      else undoEdit()
      return
    }
    if (key.ctrl && input === 'y') {
      redoEdit()
      return
    }
    if (key.meta && key.backspace && applyEditAndRefreshHint(editDeleteWordLeft({ value: v, cursor: c }))) {
      return
    }
    if (key.meta && key.delete && applyEditAndRefreshHint(editDeleteWordRight({ value: v, cursor: c }))) {
      return
    }
    if (key.meta && key.leftArrow && c > 0) {
      const moved = editCursorWordLeft({ value: v, cursor: c })
      cursorRef.current = moved.cursor
      setCursor(moved.cursor)
      return
    }
    if (key.meta && key.rightArrow && c < v.length) {
      const moved = editCursorWordRight({ value: v, cursor: c })
      cursorRef.current = moved.cursor
      setCursor(moved.cursor)
      return
    }
    if (key.backspace && applyEditAndRefreshHint(editBackspace({ value: v, cursor: c }))) {
      return
    }
    if (key.delete && applyEditAndRefreshHint(editDelete({ value: v, cursor: c }))) {
      return
    }
    if (key.leftArrow && c > 0) {
      const moved = editCursorLeft({ value: v, cursor: c })
      cursorRef.current = moved.cursor
      setCursor(moved.cursor)
      return
    }
    if (key.rightArrow && c < v.length) {
      const moved = editCursorRight({ value: v, cursor: c })
      cursorRef.current = moved.cursor
      setCursor(moved.cursor)
      return
    }
    if (key.upArrow) {
      const moved = moveCaretLine(v, c, contentWidth, -1)
      if (moved !== c) {
        cursorRef.current = moved
        setCursor(moved)
      } else {
        historyOlder()
      }
      return
    }
    if (key.downArrow) {
      const moved = moveCaretLine(v, c, contentWidth, 1)
      if (moved !== c) {
        cursorRef.current = moved
        setCursor(moved)
      } else {
        historyNewer()
      }
      return
    }
    if (key.home) {
      cursorRef.current = 0
      setCursor(0)
      return
    }
    if (key.end) {
      cursorRef.current = v.length
      setCursor(v.length)
      return
    }
    if (input && !key.ctrl && !key.meta && !isMouseResidue(input)) {
      if (/[\u0000-\u001f\u007f]/.test(input)) return
      // Typing while a chip is pending first drops the chip: any edit ends the
      // waiting/interrupt event, and the typed text inserts at the cursor.
      if (pendingChip) {
        const stripped = dismissPendingSync()
        applyEditAndRefreshHint(editInsert({ value: stripped, cursor: Math.min(c, stripped.length) }, input))
        return
      }
      applyEditAndRefreshHint(editInsert({ value: v, cursor: c }, input))
      return
    }
  })
  return { value, cursor, hintOpen, commandIndex, api: apiRef.current, pendingMode }
}