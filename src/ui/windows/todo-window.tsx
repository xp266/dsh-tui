import { TodoDialog } from '../dialog/todo-dialog.tsx'
import { useWindowService } from '../window-services.ts'
import type { WindowProps } from '../windows.ts'
import type { TodoItemLike } from '../../chat/todo-view.ts'

export function TodoWindow({ handleRef, ...props }: WindowProps) {
  const todos = useWindowService<readonly TodoItemLike[]>('todos')
  if (todos === undefined) return null
  return <TodoDialog ref={handleRef} todos={todos} {...props} />
}
