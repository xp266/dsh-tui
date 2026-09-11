import { useEffect } from 'react'
import type { Ref } from 'react'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogItem, DialogRow } from './dialog.tsx'

export interface ListDialogProps<T> {
  ref?: Ref<DialogHandle>
  title: string
  width: number
  maxHeight: number
  load: () => Promise<T[]>
  /**
   * Optional external change source: when it fires, the list reloads. Lets a
   * dialog track a registry that can grow while it is open.
   */
  reloadOn?(listener: () => void): () => void
  search?: boolean
  searchRight?: boolean
  labelOf(item: T): string
  rightOf?(item: T): string | undefined
  onSelect(item: T): void
  onClose(): void
  footerLines?: DialogFooterLine[]
  errors?: DialogFooterLine[]
}

export function ListDialog<T>({
  ref,
  title,
  width,
  maxHeight,
  load,
  reloadOn,
  search = false,
  searchRight = false,
  labelOf,
  rightOf,
  onSelect,
  onClose,
  footerLines,
  errors,
}: ListDialogProps<T>) {
  const { items, loading, error, reload } = useAsyncList(load)
  useEffect(() => reloadOn?.(reload), [reloadOn, reload])
  const itemRows: DialogRow[] = items.map(item => {
    const button: DialogItem = { type: 'button', label: labelOf(item), right: rightOf?.(item), onPress: () => onSelect(item) }
    return { items: [button] }
  })
  const footer: DialogFooterLine[] = loading ? [loadingLine()] : footerLines ?? []
  const errorLines: DialogFooterLine[] = [
    ...(error !== null ? [errorLine(error)] : []),
    ...(errors ?? []),
  ]
  return (
    <Dialog
      ref={ref}
      width={width}
      maxHeight={maxHeight}
      title={title}
      rows={itemRows}
      footer={footer}
      errors={errorLines}
      onClose={onClose}
      search={search}
      searchRight={searchRight}
      centerScroll
    />
  )
}
