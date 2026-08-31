import { homedir } from 'node:os'
import { statSync } from 'node:fs'

export const PASTE_SUMMARY_MIN_LINES = 4
export const PASTE_SUMMARY_MIN_CHARS = 601

export type PendingImage =
  | { kind: 'path'; path: string }
  | { kind: 'data'; data: Uint8Array; mediaType: string; name?: string }

export type PasteSegment =
  | { type: 'images'; paths: string[] }
  | { type: 'text'; text: string }

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export function imageMediaTypeOf(path: string): string | undefined {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return undefined
  return IMAGE_MEDIA_TYPES[path.slice(dot).toLowerCase()]
}

function normalizePathToken(token: string): string {
  let path = token.trim()
  if (path.length >= 2 && ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'")))) {
    path = path.slice(1, -1)
  }
  if (path.startsWith('file://')) path = decodeURIComponent(path.slice('file://'.length))
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return `${homedir()}${path.slice(1)}`
  return path
}

/** File managers prefix dropped files with a `copy` action line. */
function dropClipboardActionPrefix(lines: string[]): string[] {
  if (lines.length < 2) return lines
  const first = lines[0]!.trim()
  if (first !== 'copy' && first !== 'cut' && first !== 'link') return lines
  // Only strip when the remainder actually looks like dropped file paths;
  // plain prose that merely starts with such a word must survive.
  const rest = lines.slice(1).map(line => line.trim()).filter(line => line !== '')
  if (rest.length === 0) return lines
  const pathLike = rest.every(line => line.startsWith('file://') || line.startsWith('/') || line.startsWith('~/') || /^[a-zA-Z]:[\\/]/.test(line))
  return pathLike ? lines.slice(1) : lines
}

function isImagePath(line: string): boolean {
  const path = normalizePathToken(line)
  if (path === '' || imageMediaTypeOf(path) === undefined) return false
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function codePointCount(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    count += 1
    if (text.charCodeAt(i) >= 0xd800 && text.charCodeAt(i) <= 0xdbff) i += 1
  }
  return count
}

export function summarizePaste(text: string): { lines: number; characters: number } | null {
  const lines = text.split('\n').length
  const characters = codePointCount(text)
  if (lines >= PASTE_SUMMARY_MIN_LINES) return { lines, characters }
  if (lines === 1 && characters >= PASTE_SUMMARY_MIN_CHARS) return { lines, characters }
  return null
}

export function classifyPaste(raw: string): PasteSegment[] {
  const lines = dropClipboardActionPrefix(raw.split('\n'))
  const segments: PasteSegment[] = []
  let textRun: string[] = []
  const flushText = (): void => {
    if (textRun.length === 0) return
    const text = textRun.join('\n')
    if (text !== '') segments.push({ type: 'text', text })
    textRun = []
  }
  const pushImages = (paths: string[]): void => {
    const last = segments[segments.length - 1]
    if (last?.type === 'images') last.paths.push(...paths)
    else segments.push({ type: 'images', paths })
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed !== '' && isImagePath(trimmed)) {
      flushText()
      pushImages([normalizePathToken(trimmed)])
      continue
    }
    const tokens = trimmed.split(/\s+/).filter(token => token !== '')
    if (tokens.length > 1 && tokens.every(isImagePath)) {
      flushText()
      pushImages(tokens.map(normalizePathToken))
      continue
    }
    textRun.push(line)
  }
  flushText()
  return segments
}
