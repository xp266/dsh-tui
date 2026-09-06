import './runtime/prod-react.ts'
import { setColorLevel } from './terminal/capabilities.ts'
import { probeColorLevel } from './terminal/probe.ts'
import { render } from 'ink'
import { startPerformanceGuard } from './performance-guard.ts'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'
import type { ChatBridge } from './chat/bridge.ts'
import { createScreenCapture } from './terminal/screen.ts'
import { writeCursorShape } from './terminal/cursor-shape.ts'
import { startHotTheme } from './hot-theme.ts'
import { applyTheme } from './apply-theme.ts'
import { registerPalette } from './theme.ts'
import { detectBackgroundMode } from './terminal/background.ts'
import { registerThemeSettings } from './theme-settings.ts'
import type { ThemeSettingsScope } from './theme-settings.ts'
import { warmLanguages, onLanguagesWarm, clearHighlightCache } from './ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from './ui/message/md/engine.ts'
import { clearLayoutCache } from './ui/message/layout.ts'
import { warmRenderPipeline } from './ui/message/warmup.ts'
import { createTuiExtensionPoint, exposeRuntimeFaces } from './ui/extension-point.ts'
import { registerBuiltinToolViews } from './chat/builtin-tool-views.ts'
import { closeBootLog, emitBootLine, openBootLog } from './boot-log.ts'
import { configureLogs, error, error as logError, installCrashHandlers } from './log.ts'
import { env } from './env.ts'
import { upstreamDriftSummary, UPSTREAM_SUPPORTED_RANGE } from './contract/upstream.ts'

export const name = '@xp266/dshtui'

export interface Config {
  theme: 'auto' | 'dark' | 'light'
  /** Palette overrides applied on top of the built-in dark and light themes (palette key -> hex). */
  colors: Record<string, string>
  maxFps: number
  bootListTimeout: number
  alternateScreen: boolean
}

export const Config: z<Config> = z.object({
  theme: z.union(['auto', 'dark', 'light']).default('auto'),
  colors: z.dict(z.string()).default({}),
  maxFps: z.number().default(240),
  bootListTimeout: z.number().default(10000),
  alternateScreen: z.boolean().default(true),
})

const DEFAULT_CONFIG: Config = { theme: 'auto', colors: {}, maxFps: 240, bootListTimeout: 10000, alternateScreen: true }

async function initTheme(scope: ThemeSettingsScope | undefined, theme: Config['theme'], colors: Config['colors']): Promise<void> {
  if (Object.keys(colors).length > 0) {
    registerPalette({ id: 'dshtui-config', order: Number.MAX_SAFE_INTEGER, colors })
  }
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
    configureLogs({ stderr: env.debug, file: env.logFile, dir: env.logDir, level: env.logLevel, maxFileBytes: env.logMaxBytes })
    const restorePerformance = startPerformanceGuard()
    const disposeCrashHandlers = installCrashHandlers({ exit: env.crashExit })
    // Fail before any surface mounts: an out-of-range host breaks the bridge
    // in ways that render as a dead interface instead of an actionable error.
    const drift = upstreamDriftSummary()
    if (drift !== undefined) {
      const message = `dshtui requires dsh harness packages in ${UPSTREAM_SUPPORTED_RANGE} (found ${drift.kind}: ${drift.versions.join(', ')}); upgrade the dsh CLI with: npm install -g @deepseek-ai/dsh@latest`
      error('boot', message)
      throw new Error(message)
    }
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
    const buildAppNode = () => <App bridge={bridge} screen={capture} themeTick={themeTick} />
    const rerender = (): void => {
      themeTick += 1
      app?.rerender(buildAppNode())
    }
    // NOTE: the extension object must come from createTuiExtensionPoint itself;
    // ctx.get('tui') here would run before provide() and stay undefined forever.
    const { extension: extensionPoint, dispose: disposeExtensionPoint } = createTuiExtensionPoint(ctx, { onContributionsChanged: rerender })
    const disposeBuiltinToolViews = registerBuiltinToolViews()
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
        kittyKeyboard: { mode: 'auto' },
      })
      lastColumns = capture.stream.columns
      lastRows = capture.stream.rows
      const onResize = () => {
        lastColumns = capture.stream.columns
        lastRows = capture.stream.rows
        capture.stream.write('\x1b[2J\x1b[H')
        app!.clear()
        app!.rerender(buildAppNode())
      }
      capture.stream.on('resize', onResize)
      const sizePoll = setInterval(() => {
        if (capture.stream.columns !== lastColumns || capture.stream.rows !== lastRows) {
          onResize()
          // Terminals that never emit a resize event still get React-side
          // size updates through this synthetic dispatch.
          capture.stream.emit('resize')
        }
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
      await initTheme(themeScope, config.theme, config.colors)
      emitBootLine('chat bridge: connecting harness services')
      bridge = await createChatBridge(ctx)
      exposeFaces = exposeRuntimeFaces(extensionPoint, bridge)
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
        logError('boot', 'chat bridge init failed', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        closeBootLog()
      })
      .finally(() => start())
    return () => {
      disposed = true
      restorePerformance()
      exposeFaces?.()
      disposeBuiltinToolViews()
      disposeExtensionPoint()
      stopSizePoll?.()
      hotTheme?.stop()
      writeCursorShape('reset')
      bridge?.dispose()
      app?.unmount()
      disposeCrashHandlers()
    }
  })
}
