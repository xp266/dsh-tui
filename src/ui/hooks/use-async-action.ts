import { useCallback, useState } from 'react'
import { errorText } from '../../utils/text.ts'

export type AsyncActionResult<T> = { ok: true; value: T } | { ok: false }

export interface AsyncActionState {
  error: string | null
  setError(error: string | null): void
  clearError(): void
  run<T>(action: () => Promise<T>): Promise<AsyncActionResult<T>>
}

export function useAsyncAction(): AsyncActionState {
  const [error, setError] = useState<string | null>(null)
  const clearError = useCallback(() => setError(null), [])
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<AsyncActionResult<T>> => {
    try {
      return { ok: true, value: await action() }
    } catch (cause) {
      setError(errorText(cause))
      return { ok: false }
    }
  }, [])
  return { error, setError, clearError, run }
}
