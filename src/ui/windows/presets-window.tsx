import { PresetsDialog } from '../dialog/presets-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { PresetsApi } from '../dialog/presets-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export function PresetsWindow({ handleRef, ...props }: WindowProps) {
  const api = useWindowService<PresetsApi>('presets')
  if (api === undefined) return null
  return <PresetsDialog ref={handleRef} api={api} {...props} />
}
