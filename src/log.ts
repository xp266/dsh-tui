import { appendFileSync, mkdirSync } from 'node:fs'
import { appendFile, stat, rename, unlink, chmod } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { resolveDshHome } from './harness-home.ts'
import { restoreAllModes } from './terminal/modes.ts'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export interface LogLine {
  level: LogLevel
  tag: string
  message: string
  fields?: Record<string, unknown>
}

export interface CrashReport {
  kind: 'uncaughtException' | 'unhandledRejection' | 'boot'
  message: string
  stack?: string
  cause?: string
  fields?: Record<string, unknown>
}

export interface LogSink {
  line(entry: LogLine): void
  crash(report: CrashReport): void
}

export interface LogConfig {
  dir?: string
  stderr?: boolean
  file?: boolean
  level?: LogLevel
  maxFileBytes?: number
}

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024

const state = {
  stderrEnabled: false,
  fileEnabled: false,
  minLevel: 'info' as LogLevel,
  maxFileBytes: DEFAULT_MAX_FILE_BYTES,
}

const sinks = new Set<LogSink>()
let fileSink: LogSink | undefined

function levelRank(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level)
}

function fieldsText(fields: Record<string, unknown> | undefined): string {
  return fields === undefined ? '' : ` ${JSON.stringify(fields)}`
}

function formatLine(entry: LogLine): string {
  return `${new Date().toISOString()} [${entry.level}] ${entry.tag} ${entry.message}${fieldsText(entry.fields)}\n`
}

function formatCrash(report: CrashReport): string {
  return [
    `=== dshtui crash: ${report.kind} ===`,
    `time: ${new Date().toISOString()}`,
    `node: ${process.version}`,
    `message: ${report.message}${fieldsText(report.fields)}`,
    report.stack === undefined ? '' : `stack:\n${report.stack}`,
    report.cause === undefined ? '' : `cause: ${report.cause}`,
    '',
  ].join('\n')
}

function writeStderr(line: string): void {
  if (!state.stderrEnabled) return
  try {
    process.stderr.write(line)
  } catch {
    // Diagnostics must never take the UI down.
  }
}

function resolveLogFile(dir: string | undefined): string {
  return join(dir ?? join(resolveDshHome(), 'logs'), 'dshtui.log')
}

/** The absolute log path for the configured directory; shown on the boot screen. */
export function logFilePath(dir?: string): string {
  return resolveLogFile(dir)
}

/**
 * A rotation decision is only needed on a write when the file may have crossed
 * the cap; every other write skips the size stat entirely.
 */
const ROTATE_CHECK_INTERVAL_MS = 30_000

interface RotationGate {
  lastCheck: number
  inflight: boolean
}

function rotateIfNeededAsync(logFile: string, gate: RotationGate): Promise<void> {
  const now = Date.now()
  if (gate.inflight || now - gate.lastCheck < ROTATE_CHECK_INTERVAL_MS) return Promise.resolve()
  gate.inflight = true
  return stat(logFile)
    .then(stats => {
      if (stats.size < state.maxFileBytes) return undefined
      // Every rotation step is individually best-effort: losing the old
      // generation costs history, never the current log.
      return unlink(`${logFile}.1`).catch(() => {})
        .then(() => rename(logFile, `${logFile}.1`).catch(() => {}))
        .then(() => chmod(logFile, 0o600).catch(() => {}))
    })
    .catch(() => {})
    .finally(() => {
      gate.lastCheck = Date.now()
      gate.inflight = false
    })
}

function fileSinkFor(logFile: string): LogSink {
  const rotation: RotationGate = { lastCheck: 0, inflight: false }
  return {
    line(entry) {
      if (!state.fileEnabled) return
      const line = formatLine(entry)
      // The append races rotation benignly: a lost line costs a log entry, never the caller.
      void rotateIfNeededAsync(logFile, rotation)
        .then(() => appendFile(logFile, line, { mode: 0o600 }))
        .catch(() => {})
      if (entry.level === 'warn' || entry.level === 'error') {
        writeStderr(`[dshtui] ${entry.message}${fieldsText(entry.fields)}\n`)
      }
    },
    crash(report) {
      if (!state.fileEnabled) return
      const line = formatCrash(report)
      // Crash writes stay synchronous: the process may not survive the tick,
      // and losing the only crash record to buffering defeats the report.
      try {
        mkdirSync(dirname(logFile), { recursive: true, mode: 0o700 })
        appendFileSync(logFile, line, { mode: 0o600 })
      } catch {
        // Diagnostics must never take the UI down.
      }
      writeStderr(line)
    },
  }
}

function removeFileSink(): void {
  if (fileSink === undefined) return
  sinks.delete(fileSink)
  fileSink = undefined
}

export function registerLogSink(sink: LogSink): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

export function configureLogs(options: LogConfig = {}): void {
  if (options.stderr !== undefined) state.stderrEnabled = options.stderr
  if (options.level !== undefined) state.minLevel = options.level
  if (options.maxFileBytes !== undefined) state.maxFileBytes = Math.max(1, options.maxFileBytes)
  state.fileEnabled = options.file ?? state.fileEnabled
  removeFileSink()
    if (state.fileEnabled) {
      const logFile = resolveLogFile(options.dir)
      try {
        mkdirSync(dirname(logFile), { recursive: true, mode: 0o700 })
        fileSink = fileSinkFor(logFile)
        sinks.add(fileSink)
      } catch {
        // An uncreatable log directory disables file logging for this run.
        state.fileEnabled = false
      }
    }
}

function dispatch(entry: LogLine): void {
  if (levelRank(entry.level) < levelRank(state.minLevel)) return
  for (const sink of sinks) {
    try {
      sink.line(entry)
    } catch {
      // Diagnostics must never take the UI down.
    }
  }
}

function dispatchCrash(report: CrashReport): void {
  for (const sink of sinks) {
    try {
      sink.crash(report)
    } catch {
      // Diagnostics must never take the UI down.
    }
  }
}

export function log(level: LogLevel, tag: string, message: string, fields?: Record<string, unknown>): void {
  dispatch({ level, tag, message, fields })
}

export function debug(tag: string, message: string, fields?: Record<string, unknown>): void {
  log('debug', tag, message, fields)
}

export function info(tag: string, message: string, fields?: Record<string, unknown>): void {
  log('info', tag, message, fields)
}

export function warn(tag: string, message: string, fields?: Record<string, unknown>): void {
  log('warn', tag, message, fields)
}

export function error(tag: string, message: string, fields?: Record<string, unknown>): void {
  log('error', tag, message, fields)
}

function stringifyError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

export function writeCrashReport(report: CrashReport): void {
  dispatchCrash(report)
}

export function installCrashHandlers(options: { exit?: boolean } = {}): () => void {
  const onUncaught = (cause: unknown): void => {
    writeCrashReport({
      kind: 'uncaughtException',
      message: stringifyError(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
    })
    if (options.exit === true) {
      restoreAllModes()
      process.exit(1)
    }
  }
  const onRejected = (cause: unknown): void => {
    writeCrashReport({
      kind: 'unhandledRejection',
      message: stringifyError(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
    })
    if (options.exit === true) {
      restoreAllModes()
      process.exit(1)
    }
  }
  process.on('uncaughtException', onUncaught)
  process.on('unhandledRejection', onRejected)
  return () => {
    process.off('uncaughtException', onUncaught)
    process.off('unhandledRejection', onRejected)
  }
}

export { LOG_LEVELS }
