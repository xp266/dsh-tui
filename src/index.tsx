import './runtime/prod-react.ts'
import { applyProbeReport } from './terminal/capabilities.ts'
import { probeTerminal } from './terminal/probe.ts'
import { render } from 'ink'
import { startPerformanceGuard } from './performance-guard.ts'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { App } from './ui/app.tsx'
import { createChatBridge } from './chat/bridge.ts'
import type { ChatBridge } from './chat/bridge.ts'
import { createScreenCapture } from './terminal/screen.ts'
import { enterMode, restoreAllModes } from './terminal/modes.ts'
import { startHotTheme } from './hot-theme.ts'
import { applyTheme } from './apply-theme.ts'
import { registerPalette, subscribeDimState } from './theme.ts'
import { bumpSurface } from './kernel/surface.ts'
import { DEFAULT_COLLAPSE_POLICY, setCollapsePolicy } from './chat/collapse-policy.ts'
import { resolveBackgroundMode } from './terminal/background.ts'
import { warmLanguages, onLanguagesWarm, clearHighlightCache } from './ui/message/md/highlight.ts'
import { clearMarkdownBlockCache } from './ui/message/md/engine.ts'
import { clearLayoutCache } from './ui/message/layout.ts'
import { warmRenderPipeline } from './ui/message/warmup.ts'
import { createTuiExtensionPoint, exposeRuntimeFaces } from './ui/extension-point.ts'
import { registerBuiltinToolViews } from './chat/builtin-tool-views.ts'
import { bootReady, bootWarning, emitBootLine, openBootLog } from './boot-log.ts'
import { configureLogs, error, installCrashHandlers, warn } from './log.ts'
import { env } from './env.ts'
import { logFilePath } from './log.ts'
import { fatalFromCause, formatBootFatal } from './boot-fatal.ts'
import { installedUpstreamVersions, probeHostContract, upstreamDriftSummary, UPSTREAM_CEILING_VERSION, UPSTREAM_FLOOR_VERSION, UPSTREAM_SUPPORTED_RANGE } from './contract/upstream.ts'

export const name = '@xp266/dshtui'

export interface Config {
  /** Palette overrides applied on top of the built-in dark and light themes (palette key -> hex). */
  colors: Record<string, string>
  maxFps: number
  bootListTimeout: number
  alternateScreen: boolean
  /** Tool-card fold policy: row threshold, folded preview height, and per-tool force lists (name match is case-insensitive). */
  collapse: { maxLines: number; previewLines: number; folded: string[]; expanded: string[] }
}

export const Config: z<Config> = z.object({
  colors: z.dict(z.string()).default({}),
  maxFps: z.number().default(240),
  bootListTimeout: z.number().default(10000),
  alternateScreen: z.boolean().default(true),
  collapse: z.object({
    maxLines: z.number().default(DEFAULT_COLLAPSE_POLICY.maxLines),
    previewLines: z.number().default(DEFAULT_COLLAPSE_POLICY.previewLines),
    folded: z.array(z.string()).default([]),
    // The config default must repeat the policy default: an always-present
    // config field otherwise replaces it before setCollapsePolicy() runs.
    expanded: z.array(z.string()).default([...DEFAULT_COLLAPSE_POLICY.expanded]),
  }).default({ maxLines: DEFAULT_COLLAPSE_POLICY.maxLines, previewLines: DEFAULT_COLLAPSE_POLICY.previewLines, folded: [], expanded: [...DEFAULT_COLLAPSE_POLICY.expanded] }),
})

const DEFAULT_CONFIG: Config = { colors: {}, maxFps: 240, bootListTimeout: 10000, alternateScreen: true, collapse: { maxLines: DEFAULT_COLLAPSE_POLICY.maxLines, previewLines: DEFAULT_COLLAPSE_POLICY.previewLines, folded: [], expanded: [...DEFAULT_COLLAPSE_POLICY.expanded] } }

function registerConfigPalette(colors: Config['colors']): void {
  if (Object.keys(colors).length > 0) {
    registerPalette({ id: 'dshtui-config', order: Number.MAX_SAFE_INTEGER, colors })
  }
}

// workspaceRegistry is deliberately absent: its upstream startup header
// index costs seconds on large histories, so the bridge resolves it lazily
// (fail-soft) instead of gating first paint on its initialization.
export const inject = ['agentLoop', 'agents', 'sessions', 'llm', 'settings', 'credentials', 'agentDefaultModel']

/**
 * Print a boot failure to the invoking terminal and stop the process. This
 * runs before the TUI mounts, so the message lands directly in the command
 * line the user launched from — no alternate screen, no UI, no waiting.
 */
function failBoot(cause: unknown): never {
  const fatal = fatalFromCause(cause)
  const text = formatBootFatal(fatal, logFilePath(env.logDir))
  error('boot', text.trim())
  // Stderr keeps the report visible even when stdout is captured; the dsh
  // CLI inherits stdio, so both reach the user's terminal.
  process.stderr.write(`${text}\n`)
  restoreAllModes()
  process.exit(1)
}

export function apply(ctx: Context, config: Config = Config(DEFAULT_CONFIG)) {
  ctx.effect(() => {
    configureLogs({ stderr: env.debug, file: env.logFile, dir: env.logDir, level: env.logLevel, maxFileBytes: env.logMaxBytes })
    const restorePerformance = startPerformanceGuard()
    const disposeCrashHandlers = installCrashHandlers({ exit: env.crashExit })
    // ---- Gate 1: harness version drift (numbers) — pure text, no UI ----
    const drift = upstreamDriftSummary()
    if (drift !== undefined && drift.kind !== 'newer') {
      const message = `dshtui supports harness ${UPSTREAM_SUPPORTED_RANGE} (tested: ${UPSTREAM_FLOOR_VERSION}+, ceiling: ${UPSTREAM_CEILING_VERSION}); found ${drift.kind}: ${drift.versions.join(', ')}`
      failBoot(new Error(message))
    }
    if (drift?.kind === 'newer') {
      bootWarning('upstream-newer', `Harness is newer than this dshtui build was tested against (${drift.versions.join(', ')}); continuing — the calling-contract check below decides.`)
      warn('boot', `harness newer than tested: ${drift.versions.join(', ')}`)
    }
    // ---- Gate 2: live calling-convention probes — pure text, no UI ----
    const probeFailure = probeHostContract(ctx)
    if (probeFailure !== undefined) {
      failBoot(new Error(`host contract violated: ${probeFailure.message}`))
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
    let offDialogDim: (() => void) | undefined
    const buildAppNode = () => <App bridge={bridge} screen={capture} themeTick={themeTick} onForceExit={() => { app?.unmount() }} />
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
      // Seed the modes ink enables on our behalf (its own enter writes are
      // internal); a config-off alternate screen is never registered.
      if (config.alternateScreen) enterMode('alt-screen', '', '\x1b[?1049l')
      enterMode('kitty-keyboard', '', '\x1b[<u')
      enterMode('bracketed-paste', '', '\x1b[?2004l')
      enterMode('cursor', '', '\x1b[?25h\x1b[0 q')
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
      offDialogDim = subscribeDimState(() => {
        bumpSurface()
        rerender()
      })
    }
    registerConfigPalette(config.colors)
    setCollapsePolicy(config.collapse)
    openBootLog()
    emitBootLine('terminal: probing capabilities')
    void (async () => {
      // One raw-mode query burst answers color, terminal identity, and
      // background in a single round trip; the CPR sentinel ends the wait as
      // soon as the terminal has answered everything it is going to.
      const report = await probeTerminal()
      applyProbeReport(report)
      emitBootLine('theme: applying initial theme')
      // Dark and light are terminal-coupled modes, not preferences: probed
      // fresh at every startup, never persisted or hand-configured.
      applyTheme(resolveBackgroundMode(report.background))
      emitBootLine('chat bridge: connecting harness services')
      bridge = await createChatBridge(ctx)
      exposeFaces = exposeRuntimeFaces(extensionPoint, bridge)
      emitBootLine('sessions: loading session list')
      await Promise.race([
        // A slow or failing roster must not hold the interface: bootListTimeout wins the race.
        bridge.listSessions().catch(() => {}),
        new Promise<void>(resolve => {
          setTimeout(resolve, config.bootListTimeout).unref()
        }),
      ])
      emitBootLine('ready: starting interface')
      bootReady()
    })()
      .catch(cause => {
        // A bridge failure must never degrade into an empty shell: report in
        // the invoking terminal and exit, exactly like the pre-UI gates.
        failBoot(cause)
      })
      .finally(() => {
        if (!disposed) start()
      })
    return () => {
      disposed = true
      restorePerformance()
      exposeFaces?.()
      disposeBuiltinToolViews()
      disposeExtensionPoint()
      stopSizePoll?.()
      hotTheme?.stop()
      offDialogDim?.()
      bridge?.dispose()
      app?.unmount()
      capture.dispose()
      restoreAllModes()
      disposeCrashHandlers()
    }
  })
}
