import type { Context } from '@deepseek-ai/cordis'
import { registerOverlay, registerStatusLine } from './contributions.ts'
import { registerWindow } from './windows.ts'
import { registerWindowService } from './window-services.ts'
import { registerWidget } from './widgets/registry.ts'
import { registerCommand } from './input/commands.ts'
import { registerKeyBinding } from './keymap.ts'
import { registerInputStatus } from './chrome/input-status.ts'
import { registerHomeLogo, subscribeHomeLogo } from './home-logo.ts'
import { registerHintArgsProvider, registerHintMatcher } from './chrome/hint-service.ts'
import { registerPalette, subscribePalettes } from '../theme.ts'
import { paletteColor } from '../theme.ts'
import { registerClipboardBackend } from '../terminal/clipboard-backends.ts'
import { registerToolView, subscribeToolViews } from '../chat/tool-views.ts'
import { registerChatNode, subscribeChatNodes } from '../chat/chat-nodes.ts'
import { registerMessageView, subscribeMessageViews } from './message/message-views.ts'
import { registerMessageRenderer } from './message/renderers.ts'
import { subscribeMessageRenderers } from './message/renderers.ts'
import { registerBootSink } from '../boot-log.ts'
import { registerFieldKind, specialFieldFactory } from '../core/fields.ts'
import { bumpSurface } from '../kernel/surface.ts'
import { registerMarkdownBlock, registerMarkdownInline, registerPrismGrammar } from '../ui/message/md/extensions.ts'
import { registerPointerHandler } from './pointer/registry.ts'
import { registerSelectionDomain, registerSelectionTransformer, registerSelectionClipboard } from './selection/service.ts'
import { registerPasteHandler } from '../ui/input/composer-paste.ts'
import { registerComposerKeyBinding } from '../ui/input/composer-keys.ts'
import { insertIntoComposer } from '../ui/input/composer-bus.ts'
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
  TuiFieldsFace,
  TuiHomeLogoFace,
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
export function createTuiExtensionPoint(ctx: Context, hooks: TuiExtensionPointHooks = {}): { extension: TuiExtensionPoint; dispose(): void } {
  const extension: TuiExtensionPoint = {
    windows: { register: registerWindow },
    services: { register: registerWindowService },
    chrome: {
      statusLine: { register: registerStatusLine },
      overlays: { register: registerOverlay },
      widgets: { register: registerWidget },
      palette: { register: registerPalette, color: paletteColor },
      keys: { register: registerKeyBinding },
      inputStatus: { register: registerInputStatus },
      logo: { register: registerHomeLogo },
    },
    commands: { register: registerCommand },
    tools: { register: registerToolView },
    content: {
      nodes: { register: registerChatNode },
      views: { register: registerMessageView },
      renderers: { register: registerMessageRenderer },
    },
    startup: { registerSink: registerBootSink },
    fields: {
      register(contribution) {
        const off = registerFieldKind(contribution)
        surfaceChanged()
        return () => {
          off()
          surfaceChanged()
        }
      },
      factory: specialFieldFactory(),
    },
    composer: {
      paste: { register: registerPasteHandler },
      keys: { register: registerComposerKeyBinding },
      insert: insertIntoComposer,
    },
    hint: {
      matchers: { register: registerHintMatcher },
      args: { register: registerHintArgsProvider },
    },
    clipboard: { register: registerClipboardBackend },
    pointer: { register: registerPointerHandler },
    selection: {
      domains: { register: registerSelectionDomain },
      transformers: { register: registerSelectionTransformer },
      clipboard: { register: registerSelectionClipboard },
    },
    markdown: {
      blocks: {
        register(contribution) {
          const off = registerMarkdownBlock(contribution)
          contentChanged()
          return () => {
            off()
            contentChanged()
          }
        },
      },
      inline: {
        register(contribution) {
          const off = registerMarkdownInline(contribution)
          contentChanged()
          return () => {
            off()
            contentChanged()
          }
        },
      },
      languages: {
        register(contribution) {
          const off = registerPrismGrammar(contribution)
          contentChanged()
          return () => {
            off()
            contentChanged()
          }
        },
      },
    },
  }
  const surfaceChanged = (): void => {
    bumpSurface()
    hooks.onContributionsChanged?.()
  }
  const offToolViews = subscribeToolViews(surfaceChanged)
  const offMessageViews = subscribeMessageViews(surfaceChanged)
  const offPalettes = subscribePalettes(surfaceChanged)
  const offMessageRenderers = subscribeMessageRenderers(surfaceChanged)
  const offChatNodes = subscribeChatNodes(surfaceChanged)
  const offHomeLogo = subscribeHomeLogo(surfaceChanged)
  const contentChanged = (): void => {
    surfaceChanged()
  }
  const disposeService = ctx.provide('tui', extension)
  return {
    extension,
    dispose() {
      offToolViews()
      offMessageViews()
      offPalettes()
      offMessageRenderers()
      offChatNodes()
      offHomeLogo()
      disposeService()
    },
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
