import type { Context } from '@deepseek-ai/cordis'
import { registerOverlay, registerStatusLine } from './contributions.ts'
import { registerWindow } from './windows.ts'
import { registerWindowService } from './window-services.ts'
import { registerWidget } from './widgets/registry.ts'
import { registerCommand } from './input/commands.ts'
import { registerKeyBinding } from './keymap.ts'
import { registerPalette, subscribePalettes } from '../theme.ts'
import { registerToolView, subscribeToolViews } from '../chat/tool-views.ts'
import { registerChatNode, subscribeChatNodes } from '../chat/chat-nodes.ts'
import { registerMessageView, subscribeMessageViews } from './message/message-views.ts'
import { registerBootSink } from '../boot-log.ts'
import { clearLayoutCache } from './message/layout.ts'
import { createChatFace } from '../chat/chat-face.ts'
import type { ChatBridge } from '../chat/bridge.ts'
import type {
  TuiChromeFace,
  TuiExtensionPoint,
  TuiInteractionsFace,
  TuiServicesFace,
  TuiWindowsFace,
} from '../contract/index.ts'

export type {
  TuiChatFace,
  TuiChromeFace,
  TuiCommandsFace,
  TuiContentFace,
  TuiExtensionPoint,
  TuiInteractionsFace,
  TuiKeymapFace,
  TuiPaletteFace,
  TuiServicesFace,
  TuiToolsFace,
  TuiWidgetsFace,
  TuiWindowsFace,
} from '../contract/index.ts'

export interface TuiExtensionPointHooks {
  /** Invoked after a palette/content contribution changes the rendered surface. */
  onContributionsChanged?(): void
}

/**
 * Publish the TUI extension point as the `tui` cordis service so other
 * plugins can contribute windows, window services, chrome, widgets,
 * palettes, key bindings, commands, tool views, chat nodes, message views,
 * interaction panels, and the bridge-backed chat face without importing
 * this package's modules (which would fork the registries). Registration
 * lifetimes ride the contributing plugin's own fiber: callers receive
 * disposers and the registries only hold live entries.
 */
export function createTuiExtensionPoint(ctx: Context, hooks: TuiExtensionPointHooks = {}): () => void {
  const extension: TuiExtensionPoint = {
    windows: { register: registerWindow },
    services: { register: registerWindowService },
    chrome: {
      statusLine: { register: registerStatusLine },
      overlays: { register: registerOverlay },
      widgets: { register: registerWidget },
      palette: { register: registerPalette },
      keys: { register: registerKeyBinding },
    },
    commands: { register: registerCommand },
    tools: { register: registerToolView },
    content: {
      nodes: { register: registerChatNode },
      views: { register: registerMessageView },
    },
    startup: { registerSink: registerBootSink },
  }
  const surfaceChanged = (): void => {
    clearLayoutCache()
    hooks.onContributionsChanged?.()
  }
  const offToolViews = subscribeToolViews(surfaceChanged)
  const offMessageViews = subscribeMessageViews(surfaceChanged)
  const offPalettes = subscribePalettes(surfaceChanged)
  const disposeService = ctx.provide('tui', extension)
  return () => {
    offToolViews()
    offMessageViews()
    offPalettes()
    disposeService()
  }
}

/** Attach the bridge-backed faces once the chat bridge exists; returns the disposer. */
export function exposeRuntimeFaces(extension: TuiExtensionPoint, bridge: ChatBridge): () => void {
  extension.interactions = {
    panels: bridge.interactions.panels,
    push: (kind, request, signal) => bridge.interactions.pushRequest(kind, request, signal),
  }
  extension.chat = createChatFace(bridge)
  return () => {
    extension.interactions = undefined
    extension.chat = undefined
  }
}
