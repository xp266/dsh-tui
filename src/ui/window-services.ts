import { useSyncExternalStore } from 'react'

export interface WindowServiceEntry {
  api: unknown
}

type ServiceListener = () => void

const services = new Map<string, unknown>()
const serviceListeners = new Set<ServiceListener>()
const windowListeners = new Set<ServiceListener>()

function notifyService(): void {
  for (const listener of [...serviceListeners]) listener()
}

function notifyWindow(): void {
  for (const listener of [...windowListeners]) listener()
}

export function registerWindowService(name: string, api: unknown): () => void {
  services.set(name, api)
  notifyService()
  notifyWindow()
  return () => {
    if (services.get(name) === api) services.delete(name)
    notifyService()
    notifyWindow()
  }
}

export function windowService(name: string): unknown {
  return services.get(name)
}

export function subscribeWindowServices(listener: ServiceListener): () => void {
  serviceListeners.add(listener)
  return () => {
    serviceListeners.delete(listener)
  }
}

export function hasWindowServices(required: readonly string[] | undefined): boolean {
  if (required === undefined || required.length === 0) return true
  return required.every(name => services.has(name))
}

export function useWindowService<T>(name: string): T | undefined {
  return useSyncExternalStore(
    subscribeWindowServices,
    () => (services.has(name) ? (services.get(name) as T) : undefined),
    () => undefined,
  )
}
