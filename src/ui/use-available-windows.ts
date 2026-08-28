import { useSyncExternalStore } from 'react'
import { hasWindowServices, subscribeWindowServices } from './window-services.ts'
import { listWindows, subscribeWindows } from './windows.ts'
import type { WindowEntry } from './windows.ts'

const EMPTY: WindowEntry[] = []
let cache: WindowEntry[] = EMPTY

function recompute(): void {
  cache = listWindows().filter(entry => hasWindowServices(entry.contribution.required))
}

function onNotify(): void {
  recompute()
  listener?.()
}

let listener: (() => void) | undefined

function subscribe(next: () => void): () => void {
  listener = next
  const offWindows = subscribeWindows(onNotify)
  const offServices = subscribeWindowServices(onNotify)
  return () => {
    listener = undefined
    offWindows()
    offServices()
  }
}

function snapshot(): WindowEntry[] {
  return cache
}

export function useAvailableWindows(): WindowEntry[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}
