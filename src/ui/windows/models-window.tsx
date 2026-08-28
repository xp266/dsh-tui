import { ModelsDialog } from '../dialog/models-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { ModelApi } from '../dialog/models-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export interface ModelsWindowProps extends WindowProps {
  onModelSelected(provider: string, model: string): void
}

export function ModelsWindow({ onModelSelected, ...props }: ModelsWindowProps) {
  const api = useWindowService<ModelApi>('models')
  if (api === undefined) return null
  return <ModelsDialog api={api} onModelSelected={onModelSelected} {...props} />
}
