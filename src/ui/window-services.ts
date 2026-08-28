import { useSyncExternalStore } from 'react'
import { keyedRegistry } from '../kernel/registry.ts'

export const windowServices = keyedRegistry<unknown>()

export const registerWindowService = windowServices.register.bind(windowServices)
export const subscribeWindowServices = windowServices.subscribe.bind(windowServices)

export function hasWindowServices(required: readonly string[] | undefined): boolean {
  if (required === undefined || required.length === 0) return true
  return required.every(name => windowServices.has(name))
}

export function useWindowService<T>(name: string): T | undefined {
  return useSyncExternalStore(
    subscribeWindowServices,
    () => (windowServices.has(name) ? (windowServices.get(name) as T) : undefined),
    () => undefined,
  )
}
