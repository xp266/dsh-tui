import { ModelsDialog } from '../dialog/models-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { ModelApi } from '../dialog/models-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export interface ModelsWindowProps extends WindowProps {
  onModelSelected(provider: string, model: string): void
  onAddProvider(): void
}

export function ModelsWindow({ onModelSelected, onAddProvider, handleRef, ...props }: ModelsWindowProps) {
  const api = useWindowService<ModelApi>('models')
  if (api === undefined) return null
  return <ModelsDialog ref={handleRef} api={api} onModelSelected={onModelSelected} onAddProvider={onAddProvider} {...props} />
}
