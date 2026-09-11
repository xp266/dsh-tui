import type { Ref } from 'react'
import { errorLine } from './status-lines.ts'
import { useAsyncAction } from '../hooks/use-async-action.ts'
import { ListDialog } from './list-dialog.tsx'
import { DIALOG_WIDTH_MEDIUM, DIALOG_MAX_HEIGHT } from './sizes.ts'
import type { DialogHandle, DialogFooterLine } from './dialog.tsx'

export interface LanguageOption {
  id: string
  label: string
}

export interface LanguageApi {
  listLanguages(): Promise<LanguageOption[]>
  currentLanguage(): string
  selectLanguage(id: string): Promise<void>
}

export interface LanguageDialogProps {
  api: LanguageApi
  onClose: () => void
  ref?: Ref<DialogHandle>
}

export function LanguageDialog({ api, onClose, ref }: LanguageDialogProps) {
  const { error, run } = useAsyncAction()
  const current = api.currentLanguage()
  const selectLanguage = async (id: string) => {
    const result = await run(() => api.selectLanguage(id))
    if (!result.ok) return
    onClose()
  }
  const footerLines: DialogFooterLine[] = error === null ? [] : [errorLine(error)]
  return (
    <ListDialog
      ref={ref}
      title="language"
      width={DIALOG_WIDTH_MEDIUM}
      maxHeight={DIALOG_MAX_HEIGHT}
      load={api.listLanguages}
      labelOf={option => option.label}
      rightOf={option => (option.id === current ? 'current' : undefined)}
      onSelect={option => void selectLanguage(option.id)}
      onClose={onClose}
      errors={footerLines}
    />
  )
}
