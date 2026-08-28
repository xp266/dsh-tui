import { DefaultsDialog } from '../dialog/defaults-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { DefaultsApi } from '../dialog/defaults-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export function DefaultsWindow(props: WindowProps) {
  const api = useWindowService<DefaultsApi>('defaults')
  if (api === undefined) return null
  return <DefaultsDialog api={api} {...props} />
}
