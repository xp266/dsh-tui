import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from '../harness-home.ts'

const SCHEMA_VERSION = 1
const INDEX_DIR = join(resolveDshHome(), 'storages')
const INDEX_FILE = join(INDEX_DIR, 'dshtui-session-index.json')

export interface IndexHeader {
  id: string
  cwd?: string
  createdAt: number
  origin?: string
}

export interface IndexEntry {
  header: IndexHeader
  revision: string
  identity: string
  bytes: number
  title?: string
  titleAt?: number
  promptAt?: number
  titleComplete: boolean
  scannedTo: number
}

export type SessionIndex = Map<string, IndexEntry>

let cache: { index: SessionIndex } | undefined

function readHeader(value: unknown): IndexHeader | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const id = record['id']
  const createdAt = record['createdAt']
  if (typeof id !== 'string' || id === '' || typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt)) return undefined
  const cwd = record['cwd']
  const origin = record['origin']
  return {
    id,
    ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
    createdAt,
    ...(origin === 'subagent' ? { origin } : {}),
  }
}

function readEntry(value: unknown): IndexEntry | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const header = readHeader(record['header'])
  const revision = record['revision']
  const identity = record['identity']
  const bytes = record['bytes']
  const title = record['title']
  const titleAt = record['titleAt']
  const promptAt = record['promptAt']
  const titleComplete = record['titleComplete']
  const scannedTo = record['scannedTo']
  if (header === undefined || typeof revision !== 'string' || revision === '' || typeof identity !== 'string' || identity === '' || typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0 || typeof titleComplete !== 'boolean' || typeof scannedTo !== 'number' || !Number.isSafeInteger(scannedTo) || scannedTo < 0) {
    return undefined
  }
  return {
    header,
    revision,
    identity,
    bytes,
    ...(typeof title === 'string' && title !== '' ? { title } : {}),
    ...(typeof titleAt === 'number' ? { titleAt } : {}),
    ...(typeof promptAt === 'number' ? { promptAt } : {}),
    titleComplete,
    scannedTo,
  }
}

export function readIndex(): SessionIndex {
  if (cache !== undefined) return cache.index
  const index: SessionIndex = new Map()
  try {
    const parsed: unknown = JSON.parse(readFileSync(INDEX_FILE, 'utf8'))
    if (parsed !== null && typeof parsed === 'object') {
      const file = parsed as Record<string, unknown>
      if (file['version'] === SCHEMA_VERSION && file['entries'] !== null && typeof file['entries'] === 'object') {
        for (const [key, value] of Object.entries(file['entries'] as Record<string, unknown>)) {
          const entry = readEntry(value)
          if (entry !== undefined) index.set(key, entry)
        }
      }
    }
  } catch {
    // A missing, corrupt, or stale-schema index costs a rebuild and nothing else.
  }
  cache = { index }
  return index
}

export function writeIndex(index: SessionIndex): void {
  cache = { index }
  const entries: Record<string, unknown> = {}
  for (const [key, entry] of index) entries[key] = entry
  const temporary = `${INDEX_FILE}.${process.pid}.tmp`
  try {
    mkdirSync(INDEX_DIR, { recursive: true, mode: 0o700 })
    writeFileSync(temporary, JSON.stringify({ version: SCHEMA_VERSION, entries }), { mode: 0o600 })
    renameSync(temporary, INDEX_FILE)
  } catch {
    // The in-memory index is already updated; an unwritable store just
    // costs persistence for this run.
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The rename failure already decided the outcome; cleanup is best-effort.
    }
  }
}
