import { setColorLevel } from './terminal/capabilities.ts'
import { probeColorLevel } from './terminal/probe.ts'
import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'
import type { ChatBridge } from './chat/bridge.ts'
import { createScreenCapture } from './terminal/screen.ts'
import { writeCursorShape } from './terminal/cursor-shape.ts'
import { startHotTheme } from './hot-theme.ts'
import { applyTheme } from './apply-theme.ts'
import { detectBackgroundMode } from './terminal/background.ts'
import { registerThemeSettings } from './theme-settings.ts'
import type { ThemeSettingsScope } from './theme-settings.ts'
import { warmLanguages, onLanguagesWarm, clearHighlightCache } from './ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from './ui/message/md/engine.ts'
import { clearLayoutCache } from './ui/message/layout.ts'
import { warmRenderPipeline } from './ui/message/warmup.ts'
import { createTuiExtensionPoint, exposeInteractionsFace } from './ui/extension-point.ts'

export const name = 'dsh-tui'

const BOOT_LIST_TIMEOUT_MS = 10000

async function initTheme(scope: ThemeSettingsScope | undefined): Promise<void> {
  const saved = scope?.get().mode
  applyTheme(saved === 'dark' || saved === 'light' ? saved : await detectBackgroundMode())
}

export const inject = ['agentLoop', 'agents', 'sessions', 'workspaceRegistry', 'llm', 'settings', 'credentials', 'agentDefaultModel']

export function apply(ctx: Context) {
  ctx.effect(() => {
    const disposeExtensionPoint = createTuiExtensionPoint(ctx)
    warmLanguages()
    onLanguagesWarm(() => {
      clearHighlightCache()
      clearMarkdownBlockCache()
      clearLayoutCache()
      warmRenderPipeline()
    })
    const capture = createScreenCapture()
    let bridge: ChatBridge | undefined
    let app: ReturnType<typeof render> | undefined
    let hotTheme: ReturnType<typeof startHotTheme> | undefined
    let themeTick = 0
    let disposed = false
    let lastColumns = 0
    let lastRows = 0
    let stopSizePoll: (() => void) | undefined
    let exposeInteractions: (() => void) | undefined
    const extensionPoint = ctx.get('tui')
    const buildAppNode = () => <App bridge={bridge} screen={capture} themeTick={themeTick} />
    const start = (): void => {
      if (disposed || app !== undefined) return
      app = render(buildAppNode(), {
        stdout: capture.stream,
        alternateScreen: true,
        exitOnCtrlC: false,
        incrementalRendering: false,
        maxFps: 240,
      })
      lastColumns = capture.stream.columns
      lastRows = capture.stream.rows
      const onResize = () => {
        lastColumns = capture.stream.columns
        lastRows = capture.stream.rows
        capture.stream.write('\x1b[2J\x1b[3J\x1b[H')
        app!.clear()
        app!.rerender(buildAppNode())
      }
      capture.stream.on('resize', onResize)
      const sizePoll = setInterval(() => {
        if (capture.stream.columns !== lastColumns || capture.stream.rows !== lastRows) onResize()
      }, 1000)
      sizePoll.unref()
      stopSizePoll = (): void => {
        clearInterval(sizePoll)
        capture.stream.off('resize', onResize)
      }
      if (disposed) {
        stopSizePoll()
        return
      }
      hotTheme = startHotTheme(() => {
        themeTick += 1
        app?.rerender(buildAppNode())
      })
    }
    const themeScope = registerThemeSettings(ctx)
    void (async () => {
      const probed = await probeColorLevel()
      if (probed !== undefined) setColorLevel(probed)
      await initTheme(themeScope)
      bridge = await createChatBridge(ctx)
      exposeInteractions = extensionPoint === undefined ? undefined : exposeInteractionsFace(extensionPoint, bridge.interactions.panels)
      await Promise.race([
        bridge.listSessions().catch(() => {}),
        new Promise<void>(resolve => {
          setTimeout(resolve, BOOT_LIST_TIMEOUT_MS).unref()
        }),
      ])
    })()
      .catch(error => {
        console.error('chat bridge init failed', error)
      })
      .finally(() => start())
    return () => {
      disposed = true
      exposeInteractions?.()
      disposeExtensionPoint()
      stopSizePoll?.()
      hotTheme?.stop()
      writeCursorShape('reset')
      bridge?.dispose()
      app?.unmount()
    }
  })
}