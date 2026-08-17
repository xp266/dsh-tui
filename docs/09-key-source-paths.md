# 09 — Key Source Paths Index

All paths relative to the harness checkout `/home/xp266/github/deepseek-harness`.
Use this index to jump straight to the relevant code during development.

## Plugin development & framework

| Path | Content |
|---|---|
| `docs/user/develop/basic/index.md` | "Your first plugin" (plugin forms, apply, inject) |
| `docs/user/develop/basic/config.md` | Config + Schemastery |
| `docs/user/develop/basic/tool.md` | Tool DSL (`defineTool`) |
| `docs/user/develop/basic/publish.md` | Bundle/profile packaging, `dsh plugin` |
| `docs/user/develop/framework/*.md` | Lifecycle, services, events |
| `docs/user/develop/practice/*.md` | Three-role capability seams, LLM adapters |
| `docs/cordis-tutorial/` | 7-step hands-on Cordis tutorial |
| `docs/cordis-primer.md` | Cordis in five ideas |
| `docs/api-gateway.md` | Typert RPC gateway reference |
| `docs/architecture.md` | Product architecture |
| `docs/glossary.md`, `docs/capability-seams.md` | Terminology, seam families |

## CLI / boot / cmdline

| Path | Content |
|---|---|
| `apps/cli/src/args.ts` | Command-line grammar (web alias at lines ~156-169) |
| `apps/cli/src/bin.ts` | Entry (mode dispatch) |
| `apps/cli/src/profile-boot.ts` | `composeProfile`, `runProfile` |
| `apps/cli/reference/README.md` | CLI behavior reference (layer precedence, flags) |
| `packages/boot/app-boot/src/profile.ts` | Profile/bundle mechanics, templates (line ~115) |
| `packages/boot/cmdline/` | `ctx.cmdlineArgs`, `parseCmdline`, `ctx.appExit` |
| `packages/boot/boot/` | `boot()` root context assembly |

## Web UI

| Path | Content |
|---|---|
| `apps/web/` | Thin Vite shell (entry `src/main.ts`, `vite.config.ts`) |
| `packages/client/web/src/boot.tsx` | Browser boot kernel (consumes `window.__DSH_BOOT__`) |
| `packages/client/ui-*/` | ~26 client plugin packages (all feature UIs) |
| `packages/bundle/web-app/cordis.patch.yml` | The web bundle layer (424 lines) |
| `packages/bundle/web-app/src/index.ts` | web-runtime plugin (dist serving, URL print) |
| `packages/bundle/web-app/src/startup.ts` | web-startup (--host/--port/--trusted-host) |
| `packages/client/modules/src/index.ts` | `dsh.client` roster → `/plugins/<id>/client.js` |

## API / communication

| Path | Content |
|---|---|
| `packages/api/remotes/` | BFF: Agent/Session identity policy; Client assembly (`src/client/index.ts` — 5 Remote contributions) |
| `packages/api/remotes/src/remote-events.ts` | Forwarded host event whitelist |
| `packages/api/gateway/src/index.ts` | TypertGateway host dispatcher (claims 2-segment endpoints) |
| `packages/api/gateway/src/client/index.ts` | `ctx.remote` client endpoints |
| `packages/client/connection/src/index.ts` | `/api` route owner; trust fence; privileged methods; WS downlinks |
| `packages/client/connection/src/api/rpc.ts` | Four-quadrant wire envelope (ClientRequest/ServerResponse/ServerRequest/ClientResponse) |
| `packages/host/apiproxy/src/api/rpc-map.ts` | THE complete unary method map (session.*, workspace.*, settings.*, ...) |
| `packages/host/apiproxy/src/api-proxy.ts` | `createApiProxy` implementation (~2000 lines) |
| `packages/host/apiproxy/src/api/events.ts` | Mux/Host frame schemas |
| `packages/host/webserver/src/index.ts` | `ctx.webServer` (node:http) |
| `packages/host/frontend-static/` | SPA dist server |
| `packages/sdk/protocol/`, `packages/sdk/server/`, `packages/sdk/client/` | JSON-RPC stdio protocol/server/client |
| `packages/client/connection/src/client/web-api-client.ts` | Browser client (reference for a Node client) |

## Services (per-subsystem reference + source)

| Path | Content |
|---|---|
| `docs/subsystems/core.md` | `ctx.agents`, `ctx.agentLoop`, `ctx.agentPresets`, `agent/*` events, Agent handle |
| `docs/subsystems/session.md` | `ctx.sessions`, SessionEvent variants, deriveMessages |
| `docs/subsystems/tools.md` | `ctx.tools`, ToolDefinition, pipeline |
| `docs/subsystems/system-prompt.md` | `ctx.systemPrompt` |
| `docs/subsystems/commands.md` | `ctx.commands` (human commands) |
| `docs/subsystems/user-questions.md` | `ctx.userQuestions` |
| `docs/subsystems/approval.md` | `ctx.approval` |
| `docs/subsystems/goal.md` | `ctx.goals` |
| `docs/subsystems/workspace.md` | `ctx.workspaceRegistry` |
| `docs/subsystems/settings.md`, `credentials.md` | `ctx.settings`, `ctx.credentials` |
| `docs/subsystems/llm-streaming.md` | `ctx.llm`, ContentBlockMap, StreamChunk |
| `docs/subsystems/token-meter.md`, `compaction.md` | token metering, compaction |
| `docs/subsystems/session-query.md`, `session-reference.md`, `session-title.md` | resume/reference/title |
| `docs/subsystems/persistence.md` | `SessionPersistence` backends |
| `docs/subsystems/web-server.md` | `ctx.webServer` |
| `docs/subsystems/typert.md` | `ctx.typert` |
| `docs/subsystems/skill.md` (skills.md) | `ctx.skills` |
| `docs/subsystems/client-modules.md` | client bundle loading |

## Reference plugin (turtle-ui)

- Mirror: `github.com/turtle1999/turtle-ui` (formerly `packages/ui/tui` in the monorepo; removed 2026-08-04).
- Harness-side history: `.agents/notes/implemented/simplification/2026-08-04-remove-tui-package.md` (why it was externalized — the intended path for reintroducing a TUI).
- App-owned command line note: `.agents/notes/implemented/architecture/2026-08-06-app-owned-command-line.md`.
