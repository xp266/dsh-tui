import type { Ref } from 'react'
import { Dialog } from './dialog.tsx'
import { DIALOG_WIDTH_MEDIUM, DIALOG_MAX_HEIGHT } from './sizes.ts'
import type { DialogHandle, DialogRow } from './dialog.tsx'
import { todoSymbol } from '../../chat/todo-view.ts'
import type { TodoItemLike } from '../../chat/todo-view.ts'

export interface TodoDialogProps {
  ref?: Ref<DialogHandle>
  api: readonly TodoItemLike[]
  onClose: () => void
}

export function todoRows(todos: readonly TodoItemLike[]): DialogRow[] {
  return todos.map(item => ({ items: [{ type: 'static', label: `${todoSymbol(item.status)} ${item.content}` }] }))
}

export function TodoDialog({ ref, api, onClose }: TodoDialogProps) {
  return (
    <Dialog
      ref={ref}
      title="todo"
      width={DIALOG_WIDTH_MEDIUM}
      maxHeight={DIALOG_MAX_HEIGHT}
      rows={todoRows(api)}
      onClose={onClose}
    />
  )
}
