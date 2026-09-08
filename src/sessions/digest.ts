import { scheduler } from 'node:timers/promises'
import { closeSync, openSync, readSync } from 'node:fs'
import { decodeFrame, fileFacts, readWindow, resyncFrames, walkFrames } from './frames.ts'
import type { FrameRange } from './frames.ts'

export const HEAD_WINDOW_BYTES = 64 * 1024
export const HEAD_MAX_FRAMES = 128
export const TAIL_WINDOW_BYTES = 128 * 1024
const TITLE_SCAN_PAGE_BYTES = 128 * 1024

export interface SessionHeaderRecord {
  id: string
  cwd?: string
  createdAt: number
  origin?: string
  seeded: boolean
}

export interface SessionTitle {
  text: string
  at: number
}

export interface WindowDigest {
  header?: SessionHeaderRecord
  title?: SessionTitle
  promptAt?: number
  headWhole: boolean
}

interface LogLine {
  type?: unknown
  time?: unknown
  data?: unknown
}

function parseLines(plaintext: string): LogLine[] {
  const lines: LogLine[] = []
  for (const line of plaintext.split('\n')) {
    if (line.length === 0) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) lines.push(parsed as LogLine)
    } catch {
      // One damaged row must not sink the frames around it; the header
      // validator and title fold simply never see it.
    }
  }
  return lines
}

function decodeWindowLines(buffer: Buffer, frames: readonly FrameRange[]): LogLine[] {
  const lines: LogLine[] = []
  for (const frame of frames) {
    const plaintext = decodeFrame(buffer, frame)
    if (plaintext !== undefined) lines.push(...parseLines(plaintext))
  }
  return lines
}

function headerOf(lines: readonly LogLine[]): SessionHeaderRecord | undefined {
  const line = lines[0]
  if (line === undefined || line.type !== 'session') return undefined
  const record = line.data !== undefined && typeof line.data === 'object'
    ? line.data as Record<string, unknown>
    : line as unknown as Record<string, unknown>
  const id = record['id']
  const createdAt = record['createdAt']
  if (typeof id !== 'string' || id === '' || typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt)) return undefined
  const cwd = record['cwd']
  const origin = record['origin']
  const seedLength = record['seedLength']
  return {
    id,
    ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
    createdAt,
    ...(origin === 'subagent' ? { origin } : {}),
    seeded: typeof seedLength === 'number' && seedLength > 0,
  }
}

function titleOf(line: LogLine): SessionTitle | undefined {
  if (line.type !== 'session/title') return undefined
  const data = line.data
  if (data === null || typeof data !== 'object') return undefined
  const text = (data as Record<string, unknown>)['title']
  if (typeof text !== 'string' || text.trim().length === 0) return undefined
  return { text: text.trim(), at: typeof line.time === 'number' ? line.time : 0 }
}

function promptTimeOf(line: LogLine): number | undefined {
  if (line.type !== 'user/message' || typeof line.time !== 'number') return undefined
  const data = line.data
  if (data === null || typeof data !== 'object') return undefined
  const source = (data as Record<string, unknown>)['source']
  if (source === null || typeof source !== 'object') return undefined
  return (source as Record<string, unknown>)['kind'] === 'user' ? line.time : undefined
}

/** Head window (and tail, when the head is not the whole file) of one log. */
export function readWindowDigest(path: string): WindowDigest {
  const headWindow = readWindow(path, HEAD_WINDOW_BYTES)
  if (headWindow === undefined) return { headWhole: false }
  const headFrames = walkFrames(headWindow.buffer, HEAD_MAX_FRAMES)
  const headLines = decodeWindowLines(headWindow.buffer, headFrames)
  const header = headerOf(headLines)
  let title: SessionTitle | undefined
  let promptAt: number | undefined
  for (const line of headLines) {
    title ??= titleOf(line)
    const at = promptTimeOf(line)
    if (at !== undefined) promptAt = at
  }
  if (headWindow.whole) return { header, title, promptAt, headWhole: true }
  const tailWindow = readWindow(path, TAIL_WINDOW_BYTES, true)
  if (tailWindow !== undefined) {
    for (const line of decodeWindowLines(tailWindow.buffer, resyncFrames(tailWindow.buffer))) {
      const next = titleOf(line)
      if (next !== undefined) title = next
      const at = promptTimeOf(line)
      if (at !== undefined) promptAt = at
    }
  }
  return { header, title, promptAt, headWhole: false }
}

export interface WindowScan {
  title?: SessionTitle
  promptAt?: number
  scannedTo: number
  spent: number
}

/**
* Scan forward from `from`, newest regions last, under one compressed-byte
* budget. Stops on a frame boundary so the next call resumes exactly where
* this one ended; a torn final frame costs one page at most.
*/
export async function scanForTitle(path: string, from: number, budgetBytes: number): Promise<WindowScan> {
  const facts = fileFacts(path)
  if (facts === undefined) return { scannedTo: from, spent: 0 }
  let at = Math.min(from, facts.bytes)
  let spent = 0
  let title: SessionTitle | undefined
  let promptAt: number | undefined
  while (at < facts.bytes && spent < budgetBytes) {
    const length = Math.min(TITLE_SCAN_PAGE_BYTES, facts.bytes - at)
    const page = readAt(path, at, length)
    if (page === undefined) break
    const frames = resyncFrames(page)
    const last = frames.length > 0 ? frames[frames.length - 1] : undefined
    if (last === undefined || last.end === 0) {
      at += length
      spent += length
      continue
    }
    for (const line of decodeWindowLines(page, frames)) {
      const next = titleOf(line)
      if (next !== undefined) title = next
      const time = promptTimeOf(line)
      if (time !== undefined) promptAt = time
    }
    at += last.end
    spent += last.end
    await scheduler.yield()
  }
  return { title, promptAt, scannedTo: at, spent }
}

function readAt(path: string, start: number, length: number): Buffer | undefined {
  const buffer = Buffer.alloc(length)
  let handle: number
  try {
    handle = openSync(path, 'r')
  } catch {
    return undefined
  }
  try {
    const read = readSync(handle, buffer, 0, length, start)
    return read === length ? buffer : buffer.subarray(0, read)
  } catch {
    return undefined
  } finally {
    closeSync(handle)
  }
}
