import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface RetryStatus {
  attempt: number
  maxRetries: number
  untilTs: number
  code: string
}

interface RetryEventData {
  retry: number
  maxRetries?: number
  delayMs?: number
  failure?: { code?: string }
}

export function nextRetryStatus(current: RetryStatus | undefined, event: SessionEvent): RetryStatus | undefined {
  // `llm/retry*` are plugin-merged event types; the local build's session
  // typings do not include them, so the discriminant is compared as a string.
  const type = event.type as string
  if (type === 'llm/retry') {
    const data = event.data as unknown as RetryEventData
    return {
      attempt: data.retry,
      maxRetries: data.maxRetries ?? data.retry,
      untilTs: Date.now() + Math.max(0, data.delayMs ?? 0),
      code: data.failure?.code ?? 'UNKNOWN',
    }
  }
  if (type === 'llm/retry-started') {
    return current === undefined ? undefined : { ...current, untilTs: 0 }
  }
  // The retry banner lives only until the retried attempt produces its
  // settlement: an `assistant/message` means the retry succeeded, an
  // `assistant/attempt` means it failed and was abandoned.
  if (type === 'assistant/message' || type === 'assistant/attempt') return undefined
  return current
}
