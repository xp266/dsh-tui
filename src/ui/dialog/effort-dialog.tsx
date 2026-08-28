import type { Ref } from 'react'
import { errorLine } from './status-lines.ts'
import type { EffortSummary } from '../../chat/efforts.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { ListDialog } from './list-dialog.tsx'
import { DIALOG_WIDTH_NARROW, EFFORT_DIALOG_MAX_HEIGHT } from './sizes.ts'
import type { DialogHandle, DialogFooterLine } from './dialog.tsx'

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

const DIALOG_WIDTH = DIALOG_WIDTH_NARROW
const DIALOG_MAX_HEIGHT = EFFORT_DIALOG_MAX_HEIGHT

export function EffortDialog({ api, onClose, ref }: EffortDialogProps) {
  const { error, run } = useAsyncAction()
  const current = api.currentEffort()
  const selectEffort = async (id: string) => {
    const result = await run(() => api.selectEffort(id))
    if (!result.ok) return
    onClose()
  }
  const footerLines: DialogFooterLine[] = error === null ? [] : [errorLine(error)]
  return (
    <ListDialog
      ref={ref}
      title="reasoning effort"
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
