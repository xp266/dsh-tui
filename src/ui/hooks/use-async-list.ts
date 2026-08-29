import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from '../../core/text.ts'

export interface AsyncListState<T> {
  items: T[]
  loading: boolean
  error: string | null
  reload(): void
  remove(predicate: (item: T) => boolean): void
}

const LIST_CACHE_LIMIT = 32
const LOADING_HINT_DELAY_MS = 120

const listCache = new Map<string, unknown>()

function readListCache<T>(key: string): T[] | undefined {
  return listCache.get(key) as T[] | undefined
}

function writeListCache<T>(key: string, items: T[]): void {
  if (listCache.size >= LIST_CACHE_LIMIT && !listCache.has(key)) {
    const oldest = listCache.keys().next()
    if (!oldest.done) listCache.delete(oldest.value)
  }
  listCache.set(key, items)
}

export function clearAsyncListCache(): void {
  listCache.clear()
}

export function useAsyncList<T>(load: () => Promise<T[]>, cacheKey?: string): AsyncListState<T> {
  const keyRef = useRef(cacheKey)
  keyRef.current = cacheKey
  const [items, setItems] = useState<T[]>(() => (cacheKey === undefined ? [] : readListCache<T>(cacheKey) ?? []))
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
        if (keyRef.current !== undefined) writeListCache(keyRef.current, next)
      })
      .catch(cause => {
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
    if (keyRef.current !== undefined) writeListCache(keyRef.current, next)
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
