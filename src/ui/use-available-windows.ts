import { useSyncExternalStore } from 'react'
import { hasWindowServices, subscribeWindowServices } from './window-services.ts'
import { listWindows, subscribeWindows } from './windows.ts'
import type { WindowContribution } from './windows.ts'

const EMPTY: WindowContribution[] = []
let cache: WindowContribution[] = EMPTY

function subscribe(next: () => void): () => void {
  const offWindows = subscribeWindows(() => {
    cache = listWindows().filter(entry => hasWindowServices(entry.required))
    next()
  })
  const offServices = subscribeWindowServices(() => {
    cache = listWindows().filter(entry => hasWindowServices(entry.required))
    next()
  })
  cache = listWindows().filter(entry => hasWindowServices(entry.required))
  return () => {
    offWindows()
    offServices()
  }
}

function snapshot(): WindowContribution[] {
  return cache
}

export function useAvailableWindows(): WindowContribution[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}
