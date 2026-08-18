# AGENTS.md

`dsh-tui` is a standalone TUI plugin for deepseek-harness, built with TypeScript + ink.
- The plugin mounts to the harness as a bundle plugin (`dsh.bundle` + `cordis.patch.yml`), declares service dependencies via `inject`, and fetches optional services with `ctx.get()`, keeping it composable across providers.
- The plugin does only two things: the entry point and the ink UI. All backend capability comes from the harness's Cordis services and events.

## Paths

| Path | Purpose |
|---|---|
| `/home/xp266/ts/dsh-tui` | This plugin project (development project) |
| `/home/xp266/ts/dsh-tui/docs/` | deepseek-harness research docs (read-only, for reference) |
| `/home/xp266/github/deepseek-harness` | harness source (read-only, for reference) |
| `/home/xp266/github/deepseek-harness/packages/bundle/web-app/` | official web bundle (read-only, for reference) |

## Commands

```sh
pnpm install       # install dependencies
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # tsdown -> lib/
```

## Rules

- No comments in code unless strictly necessary; no emojis or pictographs.
- Never write a README.md file.
- `tests` only contains test content that is reused at high frequency.
- After completing a feature or fix, always run `pnpm test` and `pnpm build` so the `lib/` bundle stays in sync with `src/`.
- Never commit proactively; only check and commit when the user explicitly asks.
- Do not modify this document unless necessary.