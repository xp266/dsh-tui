import { useCallback, useState } from 'react'

export interface OverlayStack<T> {
  top: T | undefined
  push(entry: T): void
  pop(): void
}

export function useOverlayStack<T>(initial: T[] = []): OverlayStack<T> {
  const [entries, setEntries] = useState<T[]>(initial)
  const push = useCallback((entry: T) => {
    setEntries(current => [...current, entry])
  }, [])
  const pop = useCallback(() => {
    setEntries(current => current.slice(0, -1))
  }, [])
  return {
    top: entries[entries.length - 1],
    push,
    pop,
  }
}
