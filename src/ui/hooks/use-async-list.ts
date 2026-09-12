import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../../core/text.ts'

export interface AsyncListState<T> {
  items: T[]
  loading: boolean
  error: string | null
  reload(): void
  remove(predicate: (item: T) => boolean): void
}

const LOADING_HINT_DELAY_MS = 120

export function useAsyncList<T>(load: () => Promise<T[]>): AsyncListState<T> {
  const [items, setItems] = useState<T[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const cancelRef = useRef<(() => void) | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHintTimer = (): void => {
    if (hintTimerRef.current !== null) {
      clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
  }
  const reload = useCallback(() => {
    cancelRef.current?.()
    clearHintTimer()
    const cancelled = { current: false }
    cancelRef.current = () => {
      cancelled.current = true
    }
    setLoading(false)
    hintTimerRef.current = setTimeout(() => {
      if (!cancelled.current && itemsRef.current.length === 0) setLoading(true)
    }, LOADING_HINT_DELAY_MS)
    loadRef.current()
      .then(next => {
        if (cancelled.current) return
        itemsRef.current = next
        setItems(next)
        setError(null)
      })
      .catch(cause => {
        // The failure is surfaced, not swallowed: the dialog shows it and offers reload.
        if (cancelled.current) return
        setError(errorText(cause))
      })
      .finally(() => {
        if (cancelled.current) return
        clearHintTimer()
        setLoading(false)
      })
  }, [])
  const remove = useCallback((predicate: (item: T) => boolean) => {
    const next = itemsRef.current.filter(item => !predicate(item))
    itemsRef.current = next
    setItems(next)
  }, [])
  useEffect(() => {
    reload()
    return () => {
      cancelRef.current?.()
      clearHintTimer()
    }
  }, [reload])
  return { items, loading, error, reload, remove }
}
