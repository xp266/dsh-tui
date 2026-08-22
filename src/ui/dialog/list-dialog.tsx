import type { Ref } from 'react'
import { errorLine, loadingLine } from './status-lines.ts'
import { useAsyncList } from '../hooks/use-async-list.ts'
import { Dialog } from './dialog.tsx'
import type { DialogFooterLine, DialogHandle, DialogRow } from './dialog.tsx'

export interface ListDialogProps<T> {
  ref?: Ref<DialogHandle>
  title: string
  width: number
  maxHeight: number
  load: () => Promise<T[]>
  search?: boolean
  searchRight?: boolean
  staticRows?: DialogRow[]
  labelOf(item: T): string
  rightOf?(item: T): string | undefined
  onSelect(item: T): void
  onClose(): void
  footerLines?: DialogFooterLine[]
}

export function ListDialog<T>({
  ref,
  title,
  width,
  maxHeight,
  load,
  search = false,
  searchRight = false,
  staticRows = [],
  labelOf,
  rightOf,
  onSelect,
  onClose,
  footerLines,
}: ListDialogProps<T>) {
  const { items, loading, error } = useAsyncList(load)
  const itemRows: DialogRow[] = items.map(item => ({
    items: [{ type: 'button', label: labelOf(item), right: rightOf?.(item), onPress: () => onSelect(item) }],
  }))
  const footer: DialogFooterLine[] = loading
    ? [loadingLine()]
    : error !== null
      ? [errorLine(error)]
      : footerLines ?? []
  return (
    <Dialog
      ref={ref}
      width={width}
      maxHeight={maxHeight}
      title={title}
      rows={[...staticRows, ...itemRows]}
      footer={footer}
      onClose={onClose}
      search={search}
      searchRight={searchRight}
    />
  )
}