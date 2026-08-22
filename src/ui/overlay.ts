import { useCallback, useState } from 'react'

export interface OverlayStack<T> {
  entries: T[]
  top: T | undefined
  isOpen: boolean
  push(entry: T): void
  pop(): void
  close(): void
}

export function useOverlayStack<T>(initial: T[] = []): OverlayStack<T> {
  const [entries, setEntries] = useState<T[]>(initial)
  const push = useCallback((entry: T) => {
    setEntries(current => [...current, entry])
  }, [])
  const pop = useCallback(() => {
    setEntries(current => current.slice(0, -1))
  }, [])
  const close = useCallback(() => {
    setEntries([])
  }, [])
  return {
    entries,
    top: entries[entries.length - 1],
    isOpen: entries.length > 0,
    push,
    pop,
    close,
  }
}
