import type { Ref } from 'react'
import { errorLine } from './status-lines.ts'
import type { PresetSummary } from '../../chat/presets.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { ListDialog } from './list-dialog.tsx'
import { DIALOG_WIDTH_MEDIUM, DIALOG_MAX_HEIGHT } from './sizes.ts'
import type { DialogHandle, DialogFooterLine } from './dialog.tsx'

export interface PresetsApi {
  listPresets(): Promise<PresetSummary[]>
  currentPreset(): string
  selectPreset(id: string): Promise<void>
}

export interface PresetsDialogProps {
  api: PresetsApi
  onClose: () => void
  title?: string
  ref?: Ref<DialogHandle>
}


export function PresetsDialog({ api, onClose, title = 'preset', ref }: PresetsDialogProps) {
  const { error, run } = useAsyncAction()
  const current = api.currentPreset()
  const selectPreset = async (id: string) => {
    const result = await run(() => api.selectPreset(id))
    if (!result.ok) return
    onClose()
  }
  const footerLines: DialogFooterLine[] = error === null ? [] : [errorLine(error)]
  return (
    <ListDialog
      ref={ref}
      title={title}
      width={DIALOG_WIDTH_MEDIUM}
      maxHeight={DIALOG_MAX_HEIGHT}
      load={api.listPresets}
      search
      labelOf={preset => preset.name}
      rightOf={preset => (preset.id === current ? 'current' : undefined)}
      onSelect={preset => void selectPreset(preset.id)}
      onClose={onClose}
      errors={footerLines}
    />
  )
}
