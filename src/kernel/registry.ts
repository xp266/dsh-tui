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
  /** Cached and shared between mutations; treat the returned arrays as read-only. */
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
 *
 * `get(key)` resolves to the live layer with the lowest order (the one that
 * would win a dispatch loop), not merely the most recently registered one, so
 * single-key lookups agree with the iteration order plugins observe.
 */
export function keyedRegistry<T>(compareKeys: (a: string, b: string) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)): KeyedRegistry<T> {
  const map = new Map<string, Layer<T>>()
  const listeners = new Set<Listener>()
  // Dispatch loops read entries() once per pointer event or keystroke, so the
  // sorted snapshot is cached and rebuilt only after a register or dispose.
  let entriesCache: KeyedEntry<T>[] | undefined
  let valuesCache: T[] | undefined

  function notify(): void {
    entriesCache = undefined
    valuesCache = undefined
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // One broken listener must not starve the others or corrupt registry state.
      }
    }
  }

  function winningLayer(key: string): Layer<T> | undefined {
    let best: Layer<T> | undefined
    let layer = map.get(key)
    while (layer !== undefined) {
      if (!layer.dead && (best === undefined || layer.order < best.order)) best = layer
      layer = layer.prev
    }
    return best
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
      if (entriesCache !== undefined) return entriesCache
      entriesCache = [...map.values()]
        .map(layer => ({ key: layer.key, order: layer.order, value: layer.value }))
        .sort((a, b) => a.order - b.order || compareKeys(a.key, b.key))
      return entriesCache
    },
    values() {
      if (valuesCache !== undefined) return valuesCache
      valuesCache = this.entries().map(entry => entry.value)
      return valuesCache
    },
    get(key) {
      return winningLayer(key)?.value
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
