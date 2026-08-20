import { useState } from 'react'
import type { Ref } from 'react'
import { colors } from '../../theme.ts'
import { errorText } from '../../utils/text.ts'
import type { PresetSummary } from '../../chat/presets.ts'
import { ListDialog } from './list-dialog.tsx'
import type { DialogFooterLine, DialogHandle } from './dialog.tsx'

export interface PresetsApi {
  listPresets(): Promise<PresetSummary[]>
  currentPreset(): string
  selectPreset(id: string): Promise<void>
}

export interface PresetsDialogProps {
  api: PresetsApi
  onClose: () => void
  ref?: Ref<DialogHandle>
}

const DIALOG_WIDTH = 60
const DIALOG_MAX_HEIGHT = 14

export function PresetsDialog({ api, onClose, ref }: PresetsDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const current = api.currentPreset()
  const selectPreset = async (id: string) => {
    try {
      await api.selectPreset(id)
      onClose()
    } catch (cause) {
      setError(errorText(cause))
    }
  }
  const footerLines: DialogFooterLine[] = error === null ? [] : [{ text: error, color: colors.errorText }]
  return (
    <ListDialog
      ref={ref}
      title="preset"
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      load={api.listPresets}
      search
      labelOf={preset => preset.name}
      rightOf={preset => (preset.id === current ? 'current' : undefined)}
      onSelect={preset => void selectPreset(preset.id)}
      onClose={onClose}
      footerLines={footerLines}
    />
  )
}