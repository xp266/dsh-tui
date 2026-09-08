import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { scheduler } from 'node:timers/promises'
import { resolveDshHome } from '../harness-home.ts'
import { fileFacts } from './frames.ts'
import { readWindowDigest, scanForTitle } from './digest.ts'
import { readIndex, writeIndex } from './store.ts'
import type { IndexEntry, SessionIndex } from './store.ts'

const DEFAULT_SCAN_BUDGET_BYTES = 16 * 1024 * 1024
const YIELD_EVERY = 32

export interface ColdRow {
  id: string
  name: string
  directory: string
  createdAt: number
  updatedAt: number
  modifiedAt: number
}

export interface ColdRowOptions {
  attached: ReadonlySet<string>
  archived: ReadonlySet<string>
  budgetBytes?: number
  root?: string
}

interface Candidate {
  key: string
  path: string
  bytes: number
  modifiedAtMs: number
  identity: string
  revision: string
}

/**
* Every cold session row the picker can show: one bounded read per log whose
* change token moved since the last listing, zero reads otherwise. Titles
* resolve from the local index, the head/tail windows, or a budget-capped
* forward scan, in that order of cost; untitled sessions stay hidden, which
* matches what the full-log title fold used to surface.
*/
export async function listColdRows(options: ColdRowOptions): Promise<ColdRow[]> {
  const index = readIndex()
  const next: SessionIndex = new Map()
  const rows: ColdRow[] = []
  let changed = false
  let derived = 0
  let budget = options.budgetBytes ?? DEFAULT_SCAN_BUDGET_BYTES
  for (const candidate of candidates(options.root ?? join(resolveDshHome(), 'sessions'))) {
    const entry = index.get(candidate.key)
    if (entry !== undefined && entry.revision === candidate.revision) {
      next.set(candidate.key, entry)
      pushRow(rows, candidate, entry, options)
      continue
    }
    const digest = readWindowDigest(candidate.path)
    if (digest.header === undefined) {
      changed = true
      continue
    }
    derived += 1
    const appended = entry !== undefined
      && entry.identity === candidate.identity
      && candidate.bytes >= entry.bytes
      && candidate.bytes >= entry.scannedTo
    const tailTitle = digest.headWhole === false ? digest.title : undefined
    let title = digest.title
    let titleAt = digest.title?.at
    let promptAt = digest.promptAt
    let scannedTo = 0
    let titleComplete: boolean
    if (digest.headWhole === true || tailTitle !== undefined) {
      titleComplete = true
      scannedTo = candidate.bytes
    } else {
      titleComplete = false
      if (appended === true && entry !== undefined) {
        title = entry.title !== undefined ? { text: entry.title, at: entry.titleAt ?? 0 } : undefined
        titleAt = entry.titleAt
        promptAt = entry.promptAt
        scannedTo = entry.scannedTo
      }
    }
    if (titleComplete === false && budget > 0) {
      const scan = await scanForTitle(candidate.path, scannedTo, budget)
      budget -= scan.spent
      scannedTo = scan.scannedTo
      if (scan.title !== undefined) {
        title = scan.title
        titleAt = scan.title.at
      }
      if (scan.promptAt !== undefined) promptAt = scan.promptAt
      titleComplete = scan.scannedTo >= candidate.bytes
    }
    const updated: IndexEntry = {
      header: {
        id: digest.header.id,
        ...(digest.header.cwd !== undefined ? { cwd: digest.header.cwd } : {}),
        createdAt: digest.header.createdAt,
        ...(digest.header.origin !== undefined ? { origin: digest.header.origin } : {}),
      },
      revision: candidate.revision,
      identity: candidate.identity,
      bytes: candidate.bytes,
      ...(title !== undefined ? { title: title.text } : {}),
      ...(titleAt !== undefined ? { titleAt } : {}),
      ...(promptAt !== undefined ? { promptAt } : {}),
      titleComplete,
      scannedTo,
    }
    next.set(candidate.key, updated)
    changed = true
    pushRow(rows, candidate, updated, options)
    if (derived % YIELD_EVERY === 0) await scheduler.yield()
  }
  for (const key of index.keys()) {
    if (next.has(key) === false) changed = true
  }
  if (changed === true) writeIndex(next)
  return rows.sort((left, right) => right.modifiedAt - left.modifiedAt || right.createdAt - left.createdAt)
}

function pushRow(rows: ColdRow[], candidate: Candidate, entry: IndexEntry, options: ColdRowOptions): void {
  if (entry.title === undefined) return
  if (options.attached.has(entry.header.id) === true || options.archived.has(entry.header.id) === true) return
  if (entry.header.cwd === undefined || entry.header.origin === 'subagent') return
  rows.push({
    id: entry.header.id,
    name: entry.title ?? entry.header.id,
    directory: entry.header.cwd,
    createdAt: entry.header.createdAt,
    updatedAt: Math.max(entry.header.createdAt, entry.titleAt ?? 0, entry.promptAt ?? 0),
    modifiedAt: candidate.modifiedAtMs,
  })
}

function candidates(root: string): Candidate[] {
  const result: Candidate[] = []
  for (const project of directories(root)) {
    const projectDir = join(root, project)
    for (const session of directories(projectDir)) {
      const dir = join(projectDir, session)
      const compressed = join(dir, 'session.jsonl.zstd')
      const plain = join(dir, 'session.jsonl')
      const compressedFacts = fileFacts(compressed)
      const path = compressedFacts !== undefined ? compressed : plain
      const facts = compressedFacts ?? fileFacts(plain)
      if (facts === undefined) continue
      result.push({
        key: `${project}/${session}`,
        path,
        bytes: facts.bytes,
        modifiedAtMs: facts.modifiedAtMs,
        identity: facts.identity,
        revision: `${facts.identity}:${facts.bytes}:${facts.modifiedAtMs}`,
      })
    }
  }
  return result
}

function directories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch {
    // An unreadable directory contributes nothing here; the persistence
    // backend owns surfacing real I/O faults on the write path.
    return []
  }
}
