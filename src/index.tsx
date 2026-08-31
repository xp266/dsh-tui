import { setColorLevel } from './terminal/capabilities.ts'
import { probeColorLevel } from './terminal/probe.ts'
import { render } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
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
import { createTuiExtensionPoint, exposeRuntimeFaces } from './ui/extension-point.ts'
import { closeBootLog, emitBootLine, openBootLog } from './boot-log.ts'

export const name = 'dsh-tui'

export interface Config {
  theme: 'auto' | 'dark' | 'light'
  maxFps: number
  bootListTimeout: number
  alternateScreen: boolean
}

export const Config: z<Config> = z.object({
  theme: z.union(['auto', 'dark', 'light']).default('auto'),
  maxFps: z.number().default(240),
  bootListTimeout: z.number().default(10000),
  alternateScreen: z.boolean().default(true),
})

const DEFAULT_CONFIG: Config = { theme: 'auto', maxFps: 240, bootListTimeout: 10000, alternateScreen: true }

async function initTheme(scope: ThemeSettingsScope | undefined, theme: Config['theme']): Promise<void> {
  const saved = scope?.get().mode
  applyTheme(saved === 'dark' || saved === 'light'
    ? saved
    : theme === 'auto'
      ? await detectBackgroundMode()
      : theme)
}

export const inject = ['agentLoop', 'agents', 'sessions', 'workspaceRegistry', 'llm', 'settings', 'credentials', 'agentDefaultModel']

export function apply(ctx: Context, config: Config = Config(DEFAULT_CONFIG)) {
  ctx.effect(() => {
    const capture = createScreenCapture()
    let bridge: ChatBridge | undefined
    let app: ReturnType<typeof render> | undefined
    let hotTheme: ReturnType<typeof startHotTheme> | undefined
    let themeTick = 0
    let disposed = false
    let lastColumns = 0
    let lastRows = 0
    let stopSizePoll: (() => void) | undefined
    let exposeFaces: (() => void) | undefined
    const extensionPoint = ctx.get('tui')
    const buildAppNode = () => <App bridge={bridge} screen={capture} themeTick={themeTick} />
    const rerender = (): void => {
      themeTick += 1
      app?.rerender(buildAppNode())
    }
    const disposeExtensionPoint = createTuiExtensionPoint(ctx, { onContributionsChanged: rerender })
    warmLanguages()
    onLanguagesWarm(() => {
      clearHighlightCache()
      clearMarkdownBlockCache()
      clearLayoutCache()
      warmRenderPipeline()
    })
    const start = (): void => {
      if (disposed || app !== undefined) return
      app = render(buildAppNode(), {
        stdout: capture.stream,
        alternateScreen: config.alternateScreen,
        exitOnCtrlC: false,
        incrementalRendering: false,
        maxFps: config.maxFps,
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
      hotTheme = startHotTheme(rerender)
    }
    const themeScope = registerThemeSettings(ctx)
    openBootLog()
    emitBootLine('terminal: probing color support')
    void (async () => {
      const probed = await probeColorLevel()
      if (probed !== undefined) setColorLevel(probed)
      emitBootLine('theme: applying initial theme')
      await initTheme(themeScope, config.theme)
      emitBootLine('chat bridge: connecting harness services')
      bridge = await createChatBridge(ctx)
      exposeFaces = extensionPoint === undefined ? undefined : exposeRuntimeFaces(extensionPoint, bridge)
      emitBootLine('sessions: loading session list')
      await Promise.race([
        bridge.listSessions().catch(() => {}),
        new Promise<void>(resolve => {
          setTimeout(resolve, config.bootListTimeout).unref()
        }),
      ])
      emitBootLine('ready: starting interface')
      closeBootLog()
    })()
      .catch(error => {
        console.error('chat bridge init failed', error)
        closeBootLog()
      })
      .finally(() => start())
    return () => {
      disposed = true
      exposeFaces?.()
      disposeExtensionPoint()
      stopSizePoll?.()
      hotTheme?.stop()
      writeCursorShape('reset')
      bridge?.dispose()
      app?.unmount()
    }
  })
}
