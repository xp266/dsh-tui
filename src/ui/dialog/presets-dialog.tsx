import { Text } from 'ink'
import { forwardRef, useEffect, useState } from 'react'
import type { PresetSummary } from '../../chat/presets.ts'
import { colors } from '../../theme.ts'
import { Dialog } from './dialog.tsx'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import type { Ref } from 'react'

export interface PresetsDialogProps {
  api: {
    listPresets(): Promise<PresetSummary[]>
    currentPreset(): string
    selectPreset(id: string): Promise<void>
  }
  onClose: () => void
}

const DIALOG_WIDTH = 60
const DIALOG_MAX_HEIGHT = 14

export const PresetsDialog = forwardRef<DialogHandle, PresetsDialogProps>(function PresetsDialog(
  { api, onClose },
  ref,
) {
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadPresets = async () => {
    setLoading(true)
    try {
      setPresets(await api.listPresets())
      setError(null)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void loadPresets()
  }, [api])
  const current = api.currentPreset()
  const selectPreset = async (id: string) => {
    try {
      await api.selectPreset(id)
      onClose()
    } catch (cause) {
      setError(String(cause))
    }
  }
  const rows: DialogRow[] = presets.map(preset => ({
    items: [
      {
        type: 'button',
        label: preset.name,
        right: preset.id === current ? 'current' : undefined,
        onPress: () => void selectPreset(preset.id),
      },
    ],
  }))
  const footer = loading
    ? <Text color={colors.toolBodyText}>loading…</Text>
    : error === null
      ? undefined
      : <Text color={colors.errorText}>{error}</Text>
  return (
    <Dialog
      ref={ref as Ref<DialogHandle>}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      title="preset"
      rows={rows}
      footer={footer}
      onClose={onClose}
      search
    />
  )
})