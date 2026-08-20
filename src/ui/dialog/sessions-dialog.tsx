import { useState } from 'react'
import type { Ref } from 'react'
import { colors } from '../../theme.ts'
import { errorText } from '../../utils/text.ts'
import type { SessionSummary } from '../../chat/session-list.ts'
import { ListDialog } from './list-dialog.tsx'
import type { DialogFooterLine, DialogHandle } from './dialog.tsx'

export interface SessionsApi {
  listSessions(): Promise<SessionSummary[]>
  openSession(id: string): Promise<void>
}

export interface SessionsDialogProps {
  api: SessionsApi
  onClose: () => void
  onBeforeSessionSelected?: () => void
  onSessionSelected: (session: SessionSummary) => void
  ref?: Ref<DialogHandle>
}

const DIALOG_WIDTH = 70
const DIALOG_MAX_HEIGHT = 18

export function SessionsDialog({ api, onClose, onBeforeSessionSelected, onSessionSelected, ref }: SessionsDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const selectSession = async (session: SessionSummary) => {
    try {
      onBeforeSessionSelected?.()
      await api.openSession(session.id)
      onSessionSelected(session)
      onClose()
    } catch (cause) {
      setError(errorText(cause))
    }
  }
  const footerLines: DialogFooterLine[] = error === null ? [] : [{ text: error, color: colors.errorText }]
  return (
    <ListDialog
      ref={ref}
      title="sessions"
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      load={api.listSessions}
      search
      searchRight
      labelOf={session => session.name || session.id}
      rightOf={session => (session.ungrouped ? 'Ungrouped' : session.directory)}
      onSelect={session => void selectSession(session)}
      onClose={onClose}
      footerLines={footerLines}
    />
  )
}