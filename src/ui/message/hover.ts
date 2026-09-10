/**
 * Hovered collapsible tool card, tracked by message id. One module-level
 * slot instead of React state: pointer motion fires far more often than any
 * UI tick, and only the previously/newly hovered rows may re-render.
 */
let hovered = ''
const listeners = new Set<() => void>()

export function hoveredMessageId(): string {
  return hovered
}

export function setHoveredMessage(id: string): void {
  if (hovered === id) return
  hovered = id
  for (const listener of [...listeners]) listener()
}

export function subscribeHoveredMessage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
