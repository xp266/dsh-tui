type Listener = () => void

export interface KeyedOptions {
  order?: number
}

export interface KeyedEntry<T> {
  key: string
  order: number
  value: T
}

export interface KeyedRegistry<T> {
  register(key: string, value: T, options?: KeyedOptions): () => void
  entries(): KeyedEntry<T>[]
  values(): T[]
  get(key: string): T | undefined
  has(key: string): boolean
  subscribe(listener: Listener): () => void
}

export function keyedRegistry<T>(compareKeys: (a: string, b: string) => number = (a, b) => a.localeCompare(b)): KeyedRegistry<T> {
  const map = new Map<string, KeyedEntry<T>>()
  const listeners = new Set<Listener>()

  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  return {
    register(key, value, options) {
      map.set(key, { key, order: options?.order ?? 100, value })
      notify()
      return () => {
        const current = map.get(key)
        if (current !== undefined && current.value === value) {
          map.delete(key)
          notify()
        }
      }
    },
    entries() {
      return [...map.values()].sort((a, b) => a.order - b.order || compareKeys(a.key, b.key))
    },
    values() {
      return this.entries().map(entry => entry.value)
    },
    get(key) {
      return map.get(key)?.value
    },
    has(key) {
      return map.has(key)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
