import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../../core/text.ts'

export interface AsyncListState<T> {
  items: T[]
  loading: boolean
  error: string | null
  reload(): void
  remove(predicate: (item: T) => boolean): void
}

export function useAsyncList<T>(load: () => Promise<T[]>): AsyncListState<T> {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const cancelRef = useRef<(() => void) | null>(null)
  const reload = useCallback(() => {
    cancelRef.current?.()
    const cancelled = { current: false }
    cancelRef.current = () => {
      cancelled.current = true
    }
    setLoading(true)
    loadRef.current()
      .then(next => {
        if (cancelled.current) return
        setItems(next)
        setError(null)
      })
      .catch(cause => {
        if (cancelled.current) return
        setError(errorText(cause))
      })
      .finally(() => {
        if (!cancelled.current) setLoading(false)
      })
  }, [])
  const remove = useCallback((predicate: (item: T) => boolean) => {
    setItems(previous => previous.filter(item => !predicate(item)))
  }, [])
  useEffect(() => {
    reload()
    return () => cancelRef.current?.()
  }, [reload])
  return { items, loading, error, reload, remove }
}