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
  if (event.type === 'assistant/chunk' || event.type === 'turn/end') return undefined
  return current
}
