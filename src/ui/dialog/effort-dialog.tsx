import { useState } from 'react'
import type { Ref } from 'react'
import { colors } from '../../theme.ts'
import { errorText } from '../../utils/text.ts'
import type { EffortSummary } from '../../chat/efforts.ts'
import { ListDialog } from './list-dialog.tsx'
import type { DialogFooterLine, DialogHandle } from './dialog.tsx'

export interface EffortsApi {
  listEfforts(): Promise<EffortSummary[]>
  currentEffort(): string | undefined
  selectEffort(id: string): Promise<void>
}

export interface EffortDialogProps {
  api: EffortsApi
  onClose: () => void
  ref?: Ref<DialogHandle>
}

const DIALOG_WIDTH = 50
const DIALOG_MAX_HEIGHT = 12

export function EffortDialog({ api, onClose, ref }: EffortDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const current = api.currentEffort()
  const selectEffort = async (id: string) => {
    try {
      await api.selectEffort(id)
      onClose()
    } catch (cause) {
      setError(errorText(cause))
    }
  }
  const footerLines: DialogFooterLine[] = error === null ? [] : [{ text: error, color: colors.errorText }]
  return (
    <ListDialog
      ref={ref}
      title="model effort"
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      load={api.listEfforts}
      labelOf={effort => effort.name}
      rightOf={effort => (effort.id === current ? 'current' : undefined)}
      onSelect={effort => void selectEffort(effort.id)}
      onClose={onClose}
      footerLines={footerLines}
    />
  )
}