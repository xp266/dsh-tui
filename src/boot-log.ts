import { useSyncExternalStore } from 'react'
import { keyedRegistry } from './kernel/registry.ts'

export interface BootSink {
  id: string
  write(line: string): void
}

/** Boot lifecycle: in progress, ready (handing off to the TUI), or failed (blocked). */
export type BootPhase = 'starting' | 'ready' | 'failed'

/** Severity of a blocking boot failure, driving the hint shown on the boot screen. */
export type BootFatalKind = 'host' | 'bridge' | 'internal'

export interface BootWarning {
  /** Stable key; re-reporting the same id replaces the earlier text. */
  id: string
  text: string
}

export interface BootFatal {
  kind: BootFatalKind
  /** Headline of the failure, already formatted. */
  title: string
  /** Body lines: cause, impact, and actionable fixes. */
  detail: readonly string[]
}

export interface BootSnapshot {
  phase: BootPhase
  /** Progress lines emitted so far, in order. */
  lines: readonly string[]
  warnings: readonly BootWarning[]
  fatal: BootFatal | undefined
  /** Epoch ms when the boot failed, for the boot screen footer. */
  failedAt: number | undefined
}

const sinks = keyedRegistry<BootSink>()
const history: string[] = []
let open = false
let phase: BootPhase = 'starting'
const warnings = new Map<string, string>()
let fatal: BootFatal | undefined
let failedAt: number | undefined

let version = 0
let snapshot: BootSnapshot = { phase, lines: [], warnings: [], fatal: undefined, failedAt: undefined }
const listeners = new Set<() => void>()

function publish(): void {
  version += 1
  snapshot = {
    phase,
    lines: [...history],
    warnings: [...warnings].map(([id, text]) => ({ id, text })),
    fatal,
    failedAt,
  }
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // One broken subscriber must not starve the others or corrupt boot state.
    }
  }
}

export function bootSnapshot(): BootSnapshot {
  return snapshot
}

export function bootVersion(): number {
  return version
}

export function subscribeBoot(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBootState(): BootSnapshot {
  return useSyncExternalStore(subscribeBoot, bootSnapshot, bootSnapshot)
}

export function registerBootSink(sink: BootSink): () => void {
  if (open) {
    for (const line of history) sink.write(line)
  }
  return sinks.register(sink.id, sink)
}

export function openBootLog(): void {
  open = true
  phase = 'starting'
  history.length = 0
  warnings.clear()
  fatal = undefined
  failedAt = undefined
  publish()
}

export function emitBootLine(line: string): void {
  if (!open) return
  history.push(line)
  for (const sink of sinks.values()) sink.write(line)
  publish()
}

/**
 * Record a non-fatal startup problem. The boot continues; the warning shows
 * on the boot screen and then rides along into the TUI as a strip until it
 * is dismissed by a later boot. Re-reporting an id replaces its text.
 */
export function bootWarning(id: string, text: string): void {
  if (fatal !== undefined) return
  warnings.set(id, text)
  publish()
}

/** End the boot log: a final empty line tells plugin sinks the stream is done. */
function endBootLog(): void {
  if (!open) return
  open = false
  for (const sink of sinks.values()) sink.write('')
  history.length = 0
}

/** Boot succeeded; the TUI is taking over the screen. */
export function bootReady(): void {
  endBootLog()
  if (phase === 'ready') return
  phase = 'ready'
  publish()
}

/**
 * Boot failed: the boot screen stays up with the reason, the log path, and
 * an exit key. The TUI never mounts for this session.
 */
export function bootFailed(cause: BootFatal): void {
  endBootLog()
  phase = 'failed'
  fatal = cause
  failedAt = Date.now()
  publish()
}

/** Kept for API compatibility with older callers; `bootReady` replaces it. */
export function closeBootLog(): void {
  endBootLog()
  if (phase === 'starting') bootReady()
}
