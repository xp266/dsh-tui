import { Text } from 'ink'
import { forwardRef, useEffect, useState } from 'react'
import type { EffortSummary } from '../../chat/efforts.ts'
import { colors } from '../../theme.ts'
import { Dialog } from './dialog.tsx'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import type { Ref } from 'react'

export interface EffortDialogProps {
  api: {
    listEfforts(): Promise<EffortSummary[]>
    currentEffort(): string | undefined
    selectEffort(id: string): Promise<void>
  }
  onClose: () => void
}

const DIALOG_WIDTH = 50
const DIALOG_MAX_HEIGHT = 12

export const EffortDialog = forwardRef<DialogHandle, EffortDialogProps>(function EffortDialog(
  { api, onClose },
  ref,
) {
  const [efforts, setEfforts] = useState<EffortSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadEfforts = async () => {
    setLoading(true)
    try {
      setEfforts(await api.listEfforts())
      setError(null)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void loadEfforts()
  }, [api])
  const current = api.currentEffort()
  const selectEffort = async (id: string) => {
    try {
      await api.selectEffort(id)
      onClose()
    } catch (cause) {
      setError(String(cause))
    }
  }
  const rows: DialogRow[] = efforts.map(effort => ({
    items: [
      {
        type: 'button',
        label: effort.name,
        right: effort.id === current ? 'current' : undefined,
        onPress: () => void selectEffort(effort.id),
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
      title="model effort"
      rows={rows}
      footer={footer}
      onClose={onClose}
    />
  )
})