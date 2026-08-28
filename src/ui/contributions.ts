import type { ReactNode } from 'react'
import { keyedRegistry } from '../kernel/registry.ts'

export interface StatusLineContribution {
  id: string
  order?: number
  render(props: { columns: number }): ReactNode
}

export interface OverlayContribution {
  id: string
  render(props: { onClose(): void }): ReactNode
}

export const statusLines = keyedRegistry<StatusLineContribution>()
export const overlays = keyedRegistry<OverlayContribution>()

export const registerStatusLine = (contribution: StatusLineContribution): (() => void) =>
  statusLines.register(contribution.id, contribution, { order: contribution.order })

export const registerOverlay = (contribution: OverlayContribution): (() => void) =>
  overlays.register(contribution.id, contribution)
