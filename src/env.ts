/**
Every dshtui environment variable, parsed once at import. Values that used to
be tunable (log directory, level, rotation cap, crash-exit, forced language)
are fixed at the defaults documented in docs/environment.md.
*/
export const env = {
  /** Force color level: 0 none, 1 ansi16, 2 ansi256, 3 truecolor (also 'none'/'false'/'truecolor'). */
  color: process.env.DSH_TUI_COLOR,
  /** Render every glyph as plain ASCII. */
  ascii: process.env.DSH_TUI_ASCII === '1',
  /** Force char width model: 'wcwidth' (classic EA table, emoji 1 cell) or 'unicode' (grapheme-aware, default). */
  width: process.env.DSH_TUI_WIDTH,
  /** Force background mode: 'dark' or 'light'. */
  background: process.env.DSH_TUI_BG,
  /** Reload theme.ts on every save (path relative to cwd, default src/theme.ts). */
  hotTheme: process.env.DSH_TUI_HOT_THEME === '1',
  themePath: process.env.DSH_TUI_THEME_PATH,
  /** Mirror warnings and errors to stderr; only the exact value '1' enables it. */
  debug: process.env.DSH_TUI_DEBUG === '1',
  /** Write diagnostics under `<DSH_HOME>/logs` (default: on). */
  logFile: process.env.DSH_TUI_LOG_FILE !== '0',
}
