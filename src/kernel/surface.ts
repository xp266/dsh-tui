type Listener = () => void
type CacheClear = () => void

const listeners = new Set<Listener>()
const cacheClears = new Set<CacheClear>()

/**
 * Register a render-cache invalidation callback (message layout, markdown
 * blocks, syntax highlight, ...). The ui modules own their caches and
 * register here, so this kernel module stays free of ui imports.
 */
export function registerSurfaceCacheClear(clear: CacheClear): () => void {
  cacheClears.add(clear)
  return () => {
    cacheClears.delete(clear)
  }
}

/**
 * Single invalidation point for every rendered-surface cache plus the
 * rerender notification. Theme switches, hot reloads, and contribution
 * changes all funnel through here so no cache can be missed when the
 * surface changes.
 */
export function bumpSurface(): void {
  for (const clear of [...cacheClears]) {
    try {
      clear()
    } catch {
      // One broken cache clear must not leave the other caches stale.
    }
  }
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // isolated: one broken subscriber must not block the others
    }
  }
}

export function onSurfaceChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
