import { useSyncExternalStore } from 'react'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDshHome } from '../harness-home.ts'

/**
 * How a message typed while the agent is busy reaches it.
 *
 * - `queue` waits for the running turn to finish; the message becomes its own
 *   follow-up turn.
 * - `interrupt` steers the message into the nearest step boundary of the turn
 *   already running.
 *
 * The host implements both (`followup` vs `steer`); this store only carries the
 * user's default choice, selected in the defaults window.
 */
export type DeliveryMode = 'interrupt' | 'queue'

export const DELIVERY_MODES: readonly DeliveryMode[] = ['interrupt', 'queue']

const DEFAULT_MODE: DeliveryMode = 'queue'
const SCHEMA_VERSION = 1
const STORE_DIR = join(resolveDshHome(), 'storages')
const STORE_FILE = join(STORE_DIR, 'dshtui-delivery.json')

function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === 'interrupt' || value === 'queue'
}

function readPersisted(): DeliveryMode | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return undefined
    const file = parsed as Record<string, unknown>
    if (file['version'] !== SCHEMA_VERSION) return undefined
    const mode = file['busyEnter']
    return isDeliveryMode(mode) ? mode : undefined
  } catch {
    // A missing, corrupt, or stale-schema file costs the default and nothing else.
    return undefined
  }
}

function writePersisted(mode: DeliveryMode): void {
  const temporary = `${STORE_FILE}.${process.pid}.tmp`
  try {
    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 })
    writeFileSync(temporary, JSON.stringify({ version: SCHEMA_VERSION, busyEnter: mode }), { mode: 0o600 })
    renameSync(temporary, STORE_FILE)
  } catch {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The write failure already decided the outcome; cleanup is best-effort.
    }
  }
}

let current: DeliveryMode = readPersisted() ?? DEFAULT_MODE
const listeners = new Set<() => void>()

export function currentDeliveryMode(): DeliveryMode {
  return current
}

export function subscribeDeliveryMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setDeliveryMode(mode: DeliveryMode): void {
  if (!isDeliveryMode(mode)) throw new Error(`invalid delivery mode: ${mode}`)
  if (mode === current) return
  current = mode
  writePersisted(mode)
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // One broken subscriber must not starve the others or corrupt the store.
    }
  }
}

export function useDeliveryMode(): DeliveryMode {
  return useSyncExternalStore(subscribeDeliveryMode, currentDeliveryMode, currentDeliveryMode)
}
