English | [中文](environment.zh.md)

# Environment variables

`dshtui` auto-detects the terminal on startup, so none of these are required.
Set them only to override a detection the terminal answers wrongly.

## Display

| Variable | Values | Default | Effect |
|---|---|---|---|
| `DSH_TUI_COLOR` | `0` none, `1` ansi16, `2` ansi256, `3` truecolor; also `none`/`false` and `truecolor` | probe | Force the color level for the session; the startup probe can no longer raise it. |
| `DSH_TUI_ASCII` | `1` | off | Render every glyph as ASCII, dropping box-drawing and other Unicode. |
| `DSH_TUI_WIDTH` | `wcwidth`, `unicode` | `unicode` | Character width model. `wcwidth` uses the classic East-Asian table (emoji count as one cell); `unicode` is grapheme-aware. Set `wcwidth` when a terminal renders emoji one cell wide, otherwise columns drift and selections pick up stray spaces. |
| `DSH_TUI_BG` | `dark`, `light` | probe | Force the theme background mode instead of detecting it. |

## Theming

| Variable | Values | Default | Effect |
|---|---|---|---|
| `DSH_TUI_HOT_THEME` | `1` | off | Watch the theme source file and re-apply colors on every save. |
| `DSH_TUI_THEME_PATH` | path | `src/theme.ts` (the shipped copy) | Theme file reloaded by `DSH_TUI_HOT_THEME`; relative paths resolve against the current directory. |

## Diagnostics

| Variable | Values | Default | Effect |
|---|---|---|---|
| `DSH_TUI_DEBUG` | `1` | off | Mirror warnings and errors to stderr. |
| `DSH_TUI_LOG_FILE` | `0` to disable | on | Write the diagnostic log to `<DSH_HOME>/logs/dshtui.log`. |

## Host

| Variable | Values | Default | Effect |
|---|---|---|---|
| `DSH_HOME` | path | `~/.dsh` | Owned by DeepSeek Harness, not this plugin: it selects the harness home for the profile, session, and log stores. `dshtui` reads the same value so its own session list, language store, and log file stay inside that home. Set it only when you already run `dsh` against a non-default home. |

`DSH_TUI_DEBUG` and `DSH_TUI_LOG_FILE` still leave a fatal startup failure on
stderr regardless of their values; they control the standing log, not the
one-shot report the launcher prints when boot cannot proceed.
