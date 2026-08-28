import type { ReactNode } from 'react'

export interface StatusLineContribution {
  id: string
  order?: number
  render(props: { columns: number }): ReactNode
}

export interface OverlayContribution {
  id: string
  render(props: { onClose(): void }): ReactNode
}

type Listener = () => void

const statusLines = new Map<string, StatusLineContribution>()
const overlays = new Map<string, OverlayContribution>()
const listeners = new Set<Listener>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function registerStatusLine(contribution: StatusLineContribution): () => void {
  statusLines.set(contribution.id, contribution)
  notify()
  return () => {
    if (statusLines.get(contribution.id) === contribution) statusLines.delete(contribution.id)
    notify()
  }
}

export function registerOverlay(contribution: OverlayContribution): () => void {
  overlays.set(contribution.id, contribution)
  notify()
  return () => {
    if (overlays.get(contribution.id) === contribution) overlays.delete(contribution.id)
    notify()
  }
}

export function listStatusLines(): StatusLineContribution[] {
  return [...statusLines.values()].sort((a, b) =>
    (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id),
  )
}

export function listOverlays(): OverlayContribution[] {
  return [...overlays.values()]
}

export function subscribeContributions(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
