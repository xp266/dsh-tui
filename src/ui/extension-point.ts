import type { Context } from '@deepseek-ai/cordis'
import { registerOverlay, registerStatusLine } from './contributions.ts'
import { registerWindow } from './windows.ts'
import { registerWindowService } from './window-services.ts'
import type { InteractionPanelRegistry } from '../chat/interactions.ts'

export interface TuiWindowsFace {
  register: typeof registerWindow
}

export interface TuiServicesFace {
  register: typeof registerWindowService
}

export interface TuiChromeFace {
  statusLine: { register: typeof registerStatusLine }
  overlays: { register: typeof registerOverlay }
}

export interface TuiInteractionsFace {
  panels: InteractionPanelRegistry
}

export interface TuiExtensionPoint {
  windows: TuiWindowsFace
  services: TuiServicesFace
  chrome: TuiChromeFace
  /** Bound once the chat bridge is ready; undefined before that. */
  interactions?: TuiInteractionsFace
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tui: TuiExtensionPoint
  }
}

/**
 * Publish the TUI extension point as the `tui` cordis service so other
 * plugins can contribute windows, window services, chrome, and interaction
 * panels without importing this package's modules (which would fork the
 * registries). Registration lifetimes ride the contributing plugin's own
 * fiber: callers receive disposers and the registries only hold live entries.
 */
export function createTuiExtensionPoint(ctx: Context): () => void {
  const extension: TuiExtensionPoint = {
    windows: { register: registerWindow },
    services: { register: registerWindowService },
    chrome: {
      statusLine: { register: registerStatusLine },
      overlays: { register: registerOverlay },
    },
  }
  return ctx.provide('tui', extension)
}

/** Attach the interactions face once the bridge exists; returns the disposer. */
export function exposeInteractionsFace(extension: TuiExtensionPoint, panels: InteractionPanelRegistry): () => void {
  extension.interactions = { panels }
  return () => {
    extension.interactions = undefined
  }
}

