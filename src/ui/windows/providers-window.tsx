import { ProvidersDialog } from '../dialog/providers-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { ModelApi } from '../dialog/models-dialog.tsx'
import type { WindowProps } from '../windows.ts'

export interface ProvidersWindowProps extends WindowProps {
  onModelSelected(provider: string, model: string): void
}

export function ProvidersWindow({ onModelSelected, handleRef, ...props }: ProvidersWindowProps) {
  const api = useWindowService<ModelApi>('models')
  if (api === undefined) return null
  return <ProvidersDialog ref={handleRef} api={api} onModelSelected={onModelSelected} {...props} />
}