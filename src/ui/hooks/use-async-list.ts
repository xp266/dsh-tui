import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../../core/text.ts'

export interface AsyncListState<T> {
  items: T[]
  loading: boolean
  error: string | null
  reload(): void
}

export function useAsyncList<T>(load: () => Promise<T[]>): AsyncListState<T> {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(() => {
    const cancelled = { current: false }
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
    return () => {
      cancelled.current = true
    }
  }, [])
  useEffect(() => reload(), [reload])
  return { items, loading, error, reload }
}