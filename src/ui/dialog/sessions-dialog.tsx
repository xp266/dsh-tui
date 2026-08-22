import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { colors } from '../../theme.ts'
import { errorLine, loadingLine } from './status-lines.ts'
import type { SessionSummary } from '../../chat/session-list.ts'
import { groupSessions } from '../../chat/session-groups.ts'
import type { SessionSectionKind } from '../../chat/session-groups.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'

export interface SessionsApi {
  listSessions(): Promise<SessionSummary[]>
  openSession(id: string): Promise<void>
  archiveSession(id: string): Promise<void>
  activeSessionId(): string
  newSession(): Promise<void>
}

export interface SessionsDialogProps {
  api: SessionsApi
  onClose: () => void
  onBeforeSessionSelected?: () => void
  onSessionSelected: (session: SessionSummary) => void
  onNewSession?: () => void
  ref?: Ref<DialogHandle>
}

const DIALOG_WIDTH = 70
const DIALOG_MAX_HEIGHT = 18
const ARM_TIMEOUT_MS = 3000

const SECTION_LABELS: Record<SessionSectionKind, string> = {
  recent: 'Recent',
  today: 'Today',
  week: 'This Week',
  older: 'Other',
}

const ARCHIVE_HINT: DialogFooterLine[] = [
  { text: 'Ctrl+D to archive the session', color: colors.dialogHintText },
]

interface ArmedRow {
  key: string
  id: string
}

export function SessionsDialog({ api, onClose, onBeforeSessionSelected, onSessionSelected, onNewSession, ref }: SessionsDialogProps) {
  const { error, clearError, run } = useAsyncAction()
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const armedRef = useRef<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const itemRows = useRef(new Map<DialogItem, ArmedRow>())
  const selectSession = async (session: SessionSummary) => {
    await run(async () => {
      onBeforeSessionSelected?.()
      await api.openSession(session.id)
      onSessionSelected(session)
      onClose()
    })
  }
  const { items, loading, error: loadError, reload } = useAsyncList(api.listSessions)
  const sections = useMemo(() => groupSessions(items), [items])
  const disarm = () => {
    clearTimeout(armTimer.current)
    if (armedRef.current !== null) {
      armedRef.current = null
      setArmedKey(null)
    }
  }
  useEffect(() => () => clearTimeout(armTimer.current), [])
  const archive = async (id: string) => {
    const result = await run(async () => {
      await api.archiveSession(id)
      if (api.activeSessionId() === id) {
        onBeforeSessionSelected?.()
        onNewSession?.()
      }
      reload()
    })
    if (result.ok) clearError()
  }
  const handleCtrlD = (focused: DialogItem | undefined): boolean => {
    if (focused?.type !== 'button') return false
    const row = itemRows.current.get(focused)
    if (row === undefined) return false
    if (armedRef.current === row.key) {
      disarm()
      void archive(row.id)
      return true
    }
    clearTimeout(armTimer.current)
    armedRef.current = row.key
    setArmedKey(row.key)
    armTimer.current = setTimeout(disarm, ARM_TIMEOUT_MS)
    return true
  }
  const rows: DialogRow[] = []
  const rowRefs = new Map<DialogItem, ArmedRow>()
  sections.forEach((section, sectionIndex) => {
    rows.push({ items: [{ type: 'header', label: SECTION_LABELS[section.kind], leadingBlank: sectionIndex > 0 }] })
    for (const session of section.items) {
      const key = `${section.kind}:${session.id}`
      const armed = armedKey === key
      const item: DialogItem = {
        type: 'button',
        label: session.name || session.id,
        right: armed ? 'Press Ctrl+D again to archive' : session.ungrouped ? 'Ungrouped' : session.directory,
        onPress: () => void selectSession(session),
        ...(armed ? { rightColor: colors.errorText } : {}),
      }
      rowRefs.set(item, { key, id: session.id })
      rows.push({ items: [item] })
    }
  })
  itemRows.current = rowRefs
  const statusLine: DialogFooterLine | undefined = loading
    ? loadingLine()
    : loadError !== null
      ? errorLine(loadError)
      : error !== null
        ? errorLine(error)
        : undefined
  const footer: DialogFooterLine[] = [...(statusLine === undefined ? [] : [statusLine]), ...ARCHIVE_HINT]
  return (
    <Dialog
      ref={ref}
      title="sessions"
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      rows={rows}
      footer={footer}
      onClose={onClose}
      search
      searchRight
      onCtrlD={handleCtrlD}
      onActivity={disarm}
    />
  )
}
