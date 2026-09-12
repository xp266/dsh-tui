import type { SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * Host event payloads the session package ships without typings (the
 * plugin-merged event types are absent from its `SessionEvent` union), so
 * every consumer once carried its own `as unknown as` cast. These interfaces
 * are the single vouched-for description of each shape; a host payload drift
 * surfaces here first.
 */
export interface CommandRunData {
  commandId: string
  name: string
}

export interface CommandDoneData {
  commandId: string
  kind: 'success' | 'error'
  text?: string
}

export interface RetryStartedData {
  step: number
}

export interface RetryData {
  retry: number
  maxRetries?: number
  delayMs?: number
  failure?: { code?: string }
}

export interface CompactionStartData {
  compactionId: string
}

export interface CompactionSummaryData {
  compactionId: string
  summary: Array<{ type: string; text?: string }>
}

export interface CompactionEndData {
  compactionId: string
  error?: string
}

/** PTC sub-dispatch: one nested tool call under a root `run_code` bubble. */
export interface PtcDispatchData {
  rootCallId: string
  parentCallId: string
  subCallId: string
  name: string
  arguments: unknown
  isError?: boolean
  content?: Array<{ type: string; text?: string }>
}

/**
 * The one double cast for host event payloads: the payload type does not
 * overlap the declared union member, so TS needs the intermediate unknown.
 * Every other module reads host payloads through here.
 */
export function hostData<T>(event: SessionEvent): T {
  return event.data as unknown as T
}

/**
 * A synthetic event pair for failures the host did not report (command
 * execution throwing before an event was emitted). They never reach the
 * model; they only route through the store reducer so the failure renders
 * as a command bubble.
 */
export function syntheticEvent(type: string, data: unknown): SessionEvent {
  return { type, data } as unknown as SessionEvent
}
