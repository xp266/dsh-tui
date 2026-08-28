import { SessionsDialog } from '../dialog/sessions-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { SessionsApi } from '../dialog/sessions-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export interface SessionsWindowProps extends WindowProps {
  onBeforeSessionSelected?(): void
  onSessionSelected(): void
  onNewSession?(): void
}

export function SessionsWindow({ onBeforeSessionSelected, onSessionSelected, onNewSession, handleRef, ...props }: SessionsWindowProps) {
  const api = useWindowService<SessionsApi>('sessions')
  if (api === undefined) return null
  return (
    <SessionsDialog
      ref={handleRef}
      api={api}
      onBeforeSessionSelected={onBeforeSessionSelected}
      onSessionSelected={onSessionSelected}
      onNewSession={onNewSession}
      {...props}
    />
  )
}
