import type { ComponentType, Ref } from 'react'
import { useWindowService } from '../window-services.ts'
import type { DialogHandle } from '../dialog/dialog.tsx'
import type { WindowProps } from '../windows.ts'

export interface ServiceDialogProps<Api> {
  api: Api
  onClose(): void
  ref?: Ref<DialogHandle>
}

export function createServiceWindow<Api>(name: string, Dialog: ComponentType<ServiceDialogProps<Api>>): ComponentType<WindowProps> {
  return function ServiceWindow({ handleRef, onClose }: WindowProps) {
    const api = useWindowService<Api>(name)
    if (api === undefined) return null
    return <Dialog ref={handleRef} api={api} onClose={onClose} />
  }
}
