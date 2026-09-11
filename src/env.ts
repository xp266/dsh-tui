/**
Every dshtui environment variable, parsed once at import.
*/
import { LOG_LEVELS, type LogLevel } from './log.ts'

function parseLogLevel(value: string | undefined): LogLevel | undefined {
  return (LOG_LEVELS as readonly string[]).includes(value ?? '') ? (value as LogLevel) : undefined
}

function parseBytes(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export const env = {
  /** Force color level: 0 none, 1 ansi16, 2 ansi256, 3 truecolor. */
  color: process.env.DSH_TUI_COLOR,
  /** Render every glyph as plain ASCII. */
  ascii: process.env.DSH_TUI_ASCII === '1',
  /** Force char width model: 'wcwidth' (classic EA table, emoji 1 cell) or 'unicode' (grapheme-aware, default). */
  width: process.env.DSH_TUI_WIDTH,
  /** Force background mode: 'dark' or 'light'. */
  background: process.env.DSH_TUI_BG,
  /** Force the command-description language id (defaults to the persisted choice). */
  language: process.env.DSH_TUI_LANG,
  /** Reload theme.ts on every save (path relative to cwd, default src/theme.ts). */
  hotTheme: process.env.DSH_TUI_HOT_THEME === '1',
  themePath: process.env.DSH_TUI_THEME_PATH,
  /** Mirror warnings and errors to stderr; only the exact value '1' enables it. */
  debug: process.env.DSH_TUI_DEBUG === '1',
  /** Write diagnostics under the harness home logs directory (default: on). */
  logFile: process.env.DSH_TUI_LOG_FILE !== '0',
  /** Override the harness home base directory used for logs. */
  logDir: process.env.DSH_TUI_LOG_DIR,
  /** Minimum level written to the log file: debug | info | warn | error. */
  logLevel: parseLogLevel(process.env.DSH_TUI_LOG_LEVEL),
  /** Rotation cap for the log file in bytes. */
  logMaxBytes: parseBytes(process.env.DSH_TUI_LOG_MAX_BYTES),
  /** Exit the host process on an uncaught crash (default: record only). */
  crashExit: process.env.DSH_TUI_CRASH_EXIT === '1',
}
