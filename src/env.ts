/**
Every dsh-tui environment variable, parsed once at import.
*/
export const env = {
  /** Force color level: 0 none, 1 ansi16, 2 ansi256, 3 truecolor. */
  color: process.env.DSH_TUI_COLOR,
  /** Render every glyph as plain ASCII. */
  ascii: process.env.DSH_TUI_ASCII === '1',
  /** Force background mode: 'dark' or 'light'. */
  background: process.env.DSH_TUI_BG,
  /** Reload theme.ts on every save (path relative to cwd, default src/theme.ts). */
  hotTheme: process.env.DSH_TUI_HOT_THEME === '1',
  themePath: process.env.DSH_TUI_THEME_PATH,
}
