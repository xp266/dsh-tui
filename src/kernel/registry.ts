type Listener = () => void

export interface KeyedOptions {
  order?: number
}

interface Layer<T> {
  key: string
  order: number
  value: T
  prev: Layer<T> | undefined
  dead: boolean
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

/**
 * Keyed contribution registry with layered override semantics: registering
 * an existing key displaces the previous layer, and disposing a layer
 * restores the nearest live layer below it, so an overriding plugin that
 * unmounts hands the slot back to whatever it replaced.
 */
export function keyedRegistry<T>(compareKeys: (a: string, b: string) => number = (a, b) => a.localeCompare(b)): KeyedRegistry<T> {
  const map = new Map<string, Layer<T>>()
  const listeners = new Set<Listener>()

  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  return {
    register(key, value, options) {
      const prev = map.get(key)
      const layer: Layer<T> = { key, order: options?.order ?? 100, value, prev, dead: false }
      map.set(key, layer)
      notify()
      return () => {
        if (layer.dead) return
        layer.dead = true
        if (map.get(key) !== layer) return
        let restore = layer.prev
        while (restore !== undefined && restore.dead) restore = restore.prev
        if (restore === undefined) map.delete(key)
        else map.set(key, restore)
        notify()
      }
    },
    entries() {
      return [...map.values()]
        .map(layer => ({ key: layer.key, order: layer.order, value: layer.value }))
        .sort((a, b) => a.order - b.order || compareKeys(a.key, b.key))
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
