import { EffortDialog } from '../dialog/effort-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { EffortsApi } from '../dialog/effort-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export function EffortWindow({ handleRef, ...props }: WindowProps) {
  const api = useWindowService<EffortsApi>('efforts')
  if (api === undefined) return null
  return <EffortDialog ref={handleRef} api={api} {...props} />
}
