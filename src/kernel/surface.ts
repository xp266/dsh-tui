import { clearHighlightCache } from '../ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from '../ui/message/md/engine.ts'
import { clearLayoutCache } from '../ui/message/layout.ts'

type Listener = () => void

let version = 0
const listeners = new Set<Listener>()

/**
 * Single invalidation point for every rendered-surface cache (message layout,
 * markdown blocks, syntax highlight) plus the rerender notification. Theme
 * switches, hot reloads, and contribution changes all funnel through here so
 * no cache can be missed when the surface changes.
 */
export function bumpSurface(): void {
  version += 1
  clearLayoutCache()
  clearHighlightCache()
  clearMarkdownBlockCache()
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // isolated: one broken subscriber must not block the others
    }
  }
}

export function surfaceVersion(): number {
  return version
}

export function onSurfaceChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
