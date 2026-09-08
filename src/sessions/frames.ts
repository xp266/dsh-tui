import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 0xfd2fb528
const MAX_DECODED_FRAME_BYTES = 64 * 1024 * 1024

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
    return undefined
  }
}

export function fileFacts(path: string): FileFacts | undefined {
  let handle: number
  try {
    handle = openSync(path, 'r')
  } catch {
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
    return undefined
  }
  try {
    read = readSync(handle, buffer, 0, length, end === true ? facts.bytes - length : 0)
  } catch {
    return undefined
  } finally {
    closeSync(handle)
  }
  const covered = read === length ? buffer : buffer.subarray(0, read)
  return { buffer: covered, whole: read === facts.bytes }
}
