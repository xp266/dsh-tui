# 08 — CLI, Profiles, Bundles, Startup

Sources: `apps/cli/src/args.ts`, `apps/cli/src/bin.ts`, `apps/cli/reference/README.md`,
`packages/boot/app-boot/src/profile.ts`, `packages/boot/cmdline/README.md`, `docs/user/develop/basic/publish.md`.

## The `dsh` launcher

| Command | Meaning |
|---|---|
| `dsh --profile <name> [args...]` | Boot a profile; everything after the first unrecognized token is passed to the app unchanged |
| `dsh --profile headless "task"` | One-shot task: run a session, print final answer, exit |
| `dsh web [args...]` | Hardcoded alias for `--profile web` |
| `dsh plugin --profile <name> <pnpm args...>` | Forward pnpm into the profile dir (`add`, `remove`, `why`, `update`, ...); auto-inits missing profiles; merges bundles into `dsh.profile.bundles` |
| `dsh --profile <name> --dump-config` | Print the composed tree WITHOUT booting |
| `dsh --profile <name> --dump-default-config` | Print only bundle layers |
| `dsh --help`, `dsh -V` | Launcher help/version |

Flag rules:
- Launcher flags must come first; the first unrecognized token begins app arguments (`dsh --profile web --port 8080` — `--port` belongs to the web app).
- `--patch <path>` repeatable.
- Shutdown: first SIGINT/SIGTERM gives the plugin tree up to 5s graceful dispose (SIGTERM exits 0, SIGINT 130); second signal forces exit.
- Every profile boot watches two `cordis.patch.yml` (profile + home) with transactional replay.

## Profile mechanics

- Profile dir: `$DSH_HOME/profiles/<name>/` (`$DSH_HOME` default `~/.dsh`).
- Contents: `package.json` (`dsh.profile` manifest: ordered `bundles` list) + user `cordis.patch.yml`.
- Templates: `PROFILE_TEMPLATES = ['web', 'headless']` auto-initialize on first use; other names via `dsh plugin --profile <name> add ...`.
- First `dsh plugin` use initializes the profile with `@deepseek-ai/dsh-base` as the first bundle.
- `healProfilesModuleFallback`: maintains `$DSH_HOME/profiles/node_modules` symlinks so bare package names resolve.
- Layer order (later wins): bundles in list order → profile patch → home patch → `--patch` overlays.

## Web profile anatomy (what `dsh --profile web` mounts)

`packages/bundle/web-app/cordis.patch.yml` (424 lines) does:
1. **Override base rows**: system-prompt (web persona), hmr (disabled), session-query-sqlite (`:memory:`), tools (`DSH_TOOLS_MODE` env).
2. **Insert host rows**: code-runtime(worker-thread), storage/storage-json/storage-domain, message-feedback, session-log-download, workspace, session-projection-cache, session-stats, directory-picker(auto/browse/native), plugin-inventory, api-gateway (`@deepseek-ai/dsh-host-apiproxy`), cordis-host-runner, web-startup (`@deepseek-ai/dsh-web-app/startup`).
3. **Two-layer transport**: webserver (host/port from `webStartup`, default `127.0.0.1:3080`), web-runtime (`@deepseek-ai/dsh-web-app`: resolves dist, mounts frontend-static fallback, prints URL).
4. **Browser plugin roster** (`dsh.client` rows): modules (injects `window.__DSH_BOOT__`), connection, api-remotes, client-runtime, cordis-client-runner, all `ui-*` packages.
5. **Disable process-level agent rows** (tool-bash/pwsh/fs/jobs/skill/goal/plan-mode/subagent/workflow/todo/web disabled) because web mounts **agent presets per session**; inserts `agent-presets` (default `standard`).

`web-startup` (`packages/bundle/web-app/src/startup.ts`): `--host` (default `127.0.0.1`, explicitly rejects `0.0.0.0`), `--port` (default 3080; 0 = OS-assigned), `--trusted-host` (repeatable).

## App-owned command line (the pattern a TUI bundle uses)

1. `cmdline` package provides `ctx.cmdlineArgs.get()` (immutable argv snapshot) + `ctx.appExit` (bounded exit request).
2. App plugin: `inject = ['cmdlineArgs']`, build a commander program, `parseCmdline(ctx, program)`, in `program.action()` do `ctx.provide('myAppStartup', values)`.
3. Consumers: `inject: [myAppStartup]` + `config: { port: !!js ctx.myAppStartup.port ?? 8080 }`.
4. `--help` / parse errors exit without publishing the service → dependent rows never activate.
5. `--dump-config` runs no providers.

## Installing the TUI bundle (user-facing)

```sh
dsh plugin --profile tui add github:you/dsh-tui        # or ./tarball.tgz / ./local-path / npm package
dsh --profile tui [--resume <id>] [--session <id>]     # boot
```

Git install notes: sources only → the package MUST ship a `prepare` script (self-contained
transpile); user must add `allowBuilds: <pkg>: true` to the profile's `pnpm-workspace.yaml`.

## Development workflows in the harness repo

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml   # dev with an overlay
pnpm run build:web                                  # build frontend dist
pnpm run dev:web                                    # client-plugin hot rebuild (tsdown watch)
pnpm dsh --profile headless "task"                  # one-shot (needs DEEPSEEK_API_KEY)
```

## Key env / defaults

- `DEEPSEEK_API_KEY` — default credentials; `DEEPSEEK_BASE_URL` override; root `.env` loaded (inherited env > project `.env` > `$DSH_HOME/.env`).
- Default workspace permission preset: `workspace-write`.
- `DSH_TOOLS_MODE` = `native | code | both`.
- Session index: in-memory SQLite by default.
