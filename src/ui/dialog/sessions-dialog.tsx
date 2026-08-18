import { Text } from 'ink'
import { forwardRef, useEffect, useState } from 'react'
import type { SessionSummary } from '../../chat/session-list.ts'
import { colors } from '../../theme.ts'
import { Dialog } from './dialog.tsx'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import type { Ref } from 'react'

export interface SessionsDialogProps {
  api: {
    listSessions(): Promise<SessionSummary[]>
    openSession(id: string): Promise<void>
  }
  onClose: () => void
  onBeforeSessionSelected?: () => void
  onSessionSelected: (session: SessionSummary) => void
}

const DIALOG_WIDTH = 70
const DIALOG_MAX_HEIGHT = 18

export const SessionsDialog = forwardRef<DialogHandle, SessionsDialogProps>(function SessionsDialog(
  { api, onClose, onBeforeSessionSelected, onSessionSelected },
  ref,
) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadSessions = async () => {
    setLoading(true)
    try {
      setSessions(await api.listSessions())
      setError(null)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void loadSessions()
  }, [api])
  const selectSession = async (session: SessionSummary) => {
    try {
      onBeforeSessionSelected?.()
      await api.openSession(session.id)
      onSessionSelected(session)
      onClose()
    } catch (cause) {
      setError(String(cause))
    }
  }
  const rows: DialogRow[] = sessions.map(session => ({
    items: [
      {
        type: 'button',
        label: session.name || session.id,
        right: session.ungrouped ? 'Ungrouped' : session.directory,
        onPress: () => void selectSession(session),
      },
    ],
  }))
  const footer = loading
    ? <Text color={colors.toolBodyText}>loading…</Text>
    : error === null
      ? undefined
      : <Text color={colors.errorText}>{error}</Text>
  return (
    <Dialog
      ref={ref as Ref<DialogHandle>}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title="sessions"
      rows={rows}
      footer={footer}
      onClose={onClose}
      search
      searchRight
    />
  )
})
