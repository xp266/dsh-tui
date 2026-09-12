import { closeSync, fstatSync, openSync, readSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 0xfd2fb528
const MAX_DECODED_FRAME_BYTES = 64 * 1024 * 1024

/**
 * Canonical basename of one committed JSONL log generation, mirroring
 * `dsh-session-format`'s parser: the untagged `session.jsonl` is generation 0,
 * every later generation carries a lowercase `.vN` before the suffix. A
 * snapshot may hold several immutable generations at once (a migrated log
 * keeps its v0 file beside the v3 it was migrated into), so a reader must pick
 * the newest rather than a fixed name.
 */
const CANONICAL_LOG_FILENAME = /^session(?:\.v([1-9][0-9]*))?\.jsonl$/u
const COMPRESSION_SUFFIX = '.zstd'

export interface LogGeneration {
  /** Session format generation; 0 for the untagged `session.jsonl` name. */
  version: number
  /** Physical encoding suffix, `''` or `.zstd`. */
  compression: string
}

/** Parse one directory entry as a canonical log generation, or undefined. */
export function parseLogFilename(filename: string): LogGeneration | undefined {
  const compressed = filename.endsWith(COMPRESSION_SUFFIX)
  const base = compressed ? filename.slice(0, -COMPRESSION_SUFFIX.length) : filename
  const match = CANONICAL_LOG_FILENAME.exec(base)
  if (match === null) return undefined
  return {
    version: match[1] === undefined ? 0 : Number(match[1]),
    compression: compressed ? COMPRESSION_SUFFIX : '',
  }
}

/**
 * The newest committed log generation in one session directory, or undefined
 * when it holds none. Compressed beats plain at the same version because the
 * backend never keeps both current, so a leftover plain file is the stale one.
 */
export function newestLogPath(dir: string): string | undefined {
  let best: { path: string; version: number; compressed: boolean } | undefined
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    // An unreadable directory contributes nothing; the persistence backend
    // owns surfacing real I/O faults on the write path.
    return undefined
  }
  for (const name of names) {
    const generation = parseLogFilename(name)
    if (generation === undefined) continue
    const compressed = generation.compression !== ''
    const better = best === undefined
      || generation.version > best.version
      || (generation.version === best.version && compressed && !best.compressed)
    if (better) best = { path: join(dir, name), version: generation.version, compressed }
  }
  return best?.path
}

export interface FrameRange {
  start: number
  end: number
}

export interface FileFacts {
  bytes: number
  modifiedAtMs: number
  identity: string
}

/**
* Exclusive end offset of the frame beginning at `start`, located by walking
* the Frame_Header and Block_Header chain per RFC 8878 3.1.1. A structural
* walk answers "complete frame or torn bytes" exactly, which a magic scan
* cannot; the same walk is what makes bounded windows safe to decode.
*/
export function frameEnd(buffer: Buffer, start: number): number {
  let at = start
  if (at < 0 || at + 5 > buffer.length) return -1
  if (buffer.readUInt32LE(at) !== ZSTD_MAGIC) return -1
  at += 4
  const descriptor = buffer[at]!
  at += 1
  if ((descriptor & 24) !== 0) return -1
  const contentSizeFlag = descriptor >>> 6
  const singleSegment = (descriptor >>> 5) & 1
  const checksum = (descriptor >>> 2) & 1
  const dictionaryFlag = descriptor & 3
  const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment === 1 ? 1 : 0) : 1 << contentSizeFlag
  at += (singleSegment === 1 ? 0 : 1) + dictionaryBytes + contentSizeBytes
  for (;;) {
    if (at + 3 > buffer.length) return -1
    const blockHeader = buffer.readUIntLE(at, 3)
    at += 3
    const blockType = (blockHeader >>> 1) & 3
    if (blockType === 3) return -1
    at += blockType === 1 ? 1 : blockHeader >>> 3
    if ((blockHeader & 1) !== 0) break
  }
  if (checksum === 1) at += 4
  return at <= buffer.length ? at : -1
}

export function walkFrames(buffer: Buffer, max = Number.POSITIVE_INFINITY): FrameRange[] {
  const frames: FrameRange[] = []
  let at = 0
  while (at < buffer.length && frames.length < max) {
    const end = frameEnd(buffer, at)
    if (end === -1) break
    frames.push({ start: at, end })
    at = end
  }
  return frames
}

/**
* Frames found after skipping bytes that do not open a complete frame. Used
* on windows cut from the middle of a file, where the first bytes may sit
* inside a frame the window does not contain.
*/
export function resyncFrames(buffer: Buffer): FrameRange[] {
  let at = 0
  while (at + 4 <= buffer.length) {
    if (buffer.readUInt32LE(at) === ZSTD_MAGIC && frameEnd(buffer, at) !== -1) return walkFrames(buffer.subarray(at))
    at += 1
  }
  return []
}

export function decodeFrame(buffer: Buffer, frame: FrameRange): string | undefined {
  try {
    return zstdDecompressSync(buffer.subarray(frame.start, frame.end), { maxOutputLength: MAX_DECODED_FRAME_BYTES }).toString('utf8')
  } catch {
    // A torn or oversized frame yields no text; callers skip it and keep scanning.
    return undefined
  }
}

export function fileFacts(path: string): FileFacts | undefined {
  let handle: number
  try {
    handle = openSync(path, 'r')
  } catch {
    // A vanished or unreadable file simply has no facts; the caller drops the row.
    return undefined
  }
  try {
    const stats = fstatSync(handle)
    return {
      bytes: stats.size,
      modifiedAtMs: stats.mtimeMs,
      identity: `${stats.dev}:${stats.ino}`,
    }
  } catch {
    // An fd that opened but cannot be stat'd counts as unreadable.
    return undefined
  } finally {
    closeSync(handle)
  }
}

/**
* Read `bytes` from one end of a file without loading the whole artifact.
* `whole` reports whether the window covered the file, which tells a tail
* reader its last frame cannot be torn and a head reader it saw everything.
*/
export function readWindow(path: string, bytes: number, end = false): { buffer: Buffer; whole: boolean } | undefined {
  const facts = fileFacts(path)
  if (facts === undefined) return undefined
  const length = Math.min(bytes, facts.bytes)
  if (length === 0) return { buffer: Buffer.alloc(0), whole: true }
  const buffer = Buffer.alloc(length)
  let read = 0
  let handle: number
  try {
    handle = openSync(path, 'r')
  } catch {
    // The file can vanish between fileFacts and this open; the row is skipped.
    return undefined
  }
  try {
    read = readSync(handle, buffer, 0, length, end === true ? facts.bytes - length : 0)
  } catch {
    // A failed read leaves `read` at 0; the caller sees a torn window.
    return undefined
  } finally {
    closeSync(handle)
  }
  const covered = read === length ? buffer : buffer.subarray(0, read)
  return { buffer: covered, whole: read === facts.bytes }
}
