# 05 — Backend Interfaces (everything the TUI can drive)

The harness exposes three families of interfaces: the **Cordis service/event surface**
(same-process), the **HTTP + WebSocket API** (remote, browser-grade), and the
**JSON-RPC SDK** (stdio). All paths below are inside `/home/xp266/github/deepseek-harness`.

---

## A. Cordis services (same-process, plugin-to-plugin)

Complete generated reference: `docs/official/subsystems/*.md` (one page per subsystem).
The **58 service keys** are listed in `01-harness-architecture.md`.

Key services a TUI consumes (with the primary methods, from generated catalogs):

| Service | Purpose | Key methods |
|---|---|---|
| `ctx.agents` | Live agent registry + initiator scope | `get(id)`, `list()`, `roots()`, `create()`, `resume()`, `register(agent)`, `withInitiator()`, `currentInitiator()` |
| `ctx.agentLoop` | Concrete agent factory/driver | `create(id, options)`, `createAgent(ownerCtx, opts)`, `resume(ownerCtx, opts)` |
| `ctx.sessions` | Append-only session log | listen `session/event`; `fork(source, boundary?, childId?)`; derive messages |
| `ctx.systemPrompt` | Prompt-section assembly | `assemble(ctx, signal)`; `section()` registration |
| `ctx.tools` | Tool registry + execution pipeline | `register(tool)`, `get(name, agent)`; `tools/pre-execute`, `tools/execute`, `tools/post-execute` waterfalls |
| `ctx.llm` | LLM adapter seam | `registerAdapter()`, `providers()`, `models()` |
| `ctx.commands` | Human commands (no model turn) | `list(agent)`, `execute(agent, text, signal)`, `register(...)` |
| `ctx.userQuestions` | Ask the user questions | provider registration; `ask/requested`, `ask/resolved` events |
| `ctx.approval` | Approval/interaction capability | approval requests |
| `ctx.goals` | Same-session objectives | `create`, `edit`, `pause`, `resume`, `complete`, `clear` (also exposed as `goals/*` Remote) |
| `ctx.sessionQuery` | Search persisted sessions | resume picker support |
| `ctx.sessionPersistence` | Durable session log backends | load/flush |
| `ctx.sessionReferenceResolver` | `@session` references | resolve |
| `ctx.skills` | Skill provider registry | `list()` etc. |
| `ctx.workspaceRegistry` | Workspaces | `list()`, `create()`, `rename()`, `delete()`, `archiveSession()` |
| `ctx.settings` | User settings capability | `describe()`, `update()`, `mutate()`, `replace()`, `openDocument()` |
| `ctx.credentials` | Credential references | `describe()`, `set()`, `unset()` |
| `ctx.tokenMeter` | Token/context usage | `measure(session)` |
| `ctx.sessionTitle` | Session title generation | sole provider |
| `ctx.sessionProjections` / `sessionProjectionCache` | Projections over the log | web-UI support |
| `ctx.jobs` | Background jobs | list, stop |
| `ctx.planMode` | Plan mode | plan state |
| `ctx.agentPresets` | Per-session agent composition | `list()`, `resolve()`, `mount()`, `copy()`, `remove()`, `recompose()` |
| `ctx.shellEnv` | Process env vars | register/set (`DSH_WEB_URL` pattern) |
| `ctx.messageFeedback` | Feedback storage | `list()`, `put()`, `delete()` |
| `ctx.cmdlineArgs` | Launcher argv snapshot | `get()` (immutable) |
| `ctx.appExit` | Bounded process exit | request exit |
| `ctx.webServer` | HTTP server (carrier) | `register(route)`, `registerUpgrade(route)` |
| `ctx.typert` / `ctx.typertGateway` | Remote gateway | Gateway claims 2-segment endpoints |
| `ctx.storage` / `ctx.storageDomain` | Plugin storage | JSON backend default |

### Events (live, same-process)

- **Agent events**: `agent/created`, `agent/disposed`, `agent/error`, `agent/inbox/*`,
  `agent/pre-step`, `agent/request`, `agent/request-error`, `agent/session-start`,
  `agent/status` (`idle`/`running`), `agent/turn-stopping`.
- **Tool pipeline**: `tools/pre-execute`, `tools/execute`, `tools/post-execute` (waterfalls).
- **Capability events**: `fs/*`, `skills/change`, `commands/change`, `llm/adapters-updated`,
  `settings/document-updated`, `credentials/updated`, `agent-preset/selected`, `goals/*`...
- **Durable session events** (via `session/event`, `event.type`): `turn/start`, `turn/end`,
  `step/start`, `step/end`, `user/message`, `assistant/chunk`, `assistant/message`,
  `tool/call`, `tool/result`, `steering/message`, `todo/write`, `request/header`
  (+ extensible via `SessionEventMap`).

---

## B. HTTP + WebSocket API (remote client)

Owned by `packages/client/connection` (routes under `/api`) + `packages/host/apiproxy`
(legacy unary RPC) + `packages/api/gateway` (Typert Remote). Server: `packages/host/webserver`.
Default: `http://127.0.0.1:3080`.

### B1. Unary RPC — `POST /api/<method>` (legacy API Proxy)

Request envelope: `{ type: 'client-request', rpcId, method, payload }` (Content-Type must be application/json, else 415).
Response: `{ type: 'server-response', rpcId, result: RpcResult }` — business errors are HTTP 200 with `{ ok: false, error: { code, message, details } }`.

**Complete method map** (`packages/host/apiproxy/src/api/rpc-map.ts`):

| Domain | Methods |
|---|---|
| session | `session.list`, `session.search`, `session.create`, `session.history`, `session.models`, `session.selectModel`, `session.rename`, `session.fork`, `session.prompt`, `session.attachment`, `session.updateQueue`, `session.cancel` |
| subagent | `subagent.list`, `subagent.history`, `subagent.prompt`, `subagent.interrupt` |
| host | `host.describe`, `host.pickDirectory`, `host.listDirectory`, `host.createDirectory`, `host.openPath` |
| workspace | `workspace.list`, `workspace.create`, `workspace.rename`, `workspace.delete`, `workspace.insertBefore`, `workspace.insertSessionBefore`, `workspace.archiveSession` |
| skill | `skill.list` |
| agentPreset | `agentPreset.list`, `agentPreset.select`, `agentPreset.read`, `agentPreset.copy`, `agentPreset.openDocument`, `agentPreset.remove` |
| goal | `goal.create`, `goal.edit`, `goal.pause`, `goal.resume`, `goal.complete`, `goal.clear` |
| settings | `settings.describe`, `settings.openDocument`, `settings.update`, `settings.replace`, `settings.mutate` |
| credentials | `credentials.describe`, `credentials.set`, `credentials.unset` |
| llm | `llm.providers`, `llm.models`, `llm.discoverModels` |
| respond | `POST /api/respond` — ClientResponseack for approval/question server-requests |
| downloads | `GET /api/session.export?sessionId=…&includeDescendants=…` — streaming ZIP (HEAD works) |

### B2. Typert Gateway endpoints — `POST /api/<namespace>/<method>` (2-segment)

Payload contains only a named `args` object: `{ args: { ... } }`.
Response: `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`.
Mounted namespaces (from `packages/api/remotes/src/client/index.ts`):

| Namespace | Methods |
|---|---|
| `commands` | `commands/list`, `commands/execute` |
| `goals` | `goals/create`, `goals/edit`, `goals/pause`, `goals/resume`, `goals/complete`, `goals/clear` |
| `pluginInventory` | `pluginInventory/list` |
| `messageFeedback` | `messageFeedback/list`, `messageFeedback/put`, `messageFeedback/delete` |
| `dynamicCordisRunner` | `runHostHalf`, `getClientCode`, `resolveRequestRun`, `settleUserRun`, `stopFromPanel`, `invoke`, `inventory`, ... (cordis panel) |

Gateway dispatch: claims 2-segment endpoints with a strict Typert descriptor (or SRC marker);
everything else falls back to the legacy API Proxy. Gateway error codes:
`ambiguous-endpoint`, `arguments-invalid`, `binding-invalid`, `context-failed`,
`context-not-found`, `context-unavailable`, `definition-unavailable`, `input-invalid`,
`invocation-unavailable`, `lookup-failed`, `lookup-not-found`, `lookup-unavailable`,
`method-unavailable`, `provider-mismatch`, `result-invalid`, `service-unavailable`,
`signature-invalid`. Lookup failures keep their own codes (`agent-busy`, `session-not-found`, `internal`).

### B3. WebSocket downlinks (server → client, downlink-only)

| Path | Frames (all `ServerRequest`, text JSON) |
|---|---|
| `/api/events.mux` | `session/event`, `session/subscribed`, `approval/requested`, `approval/resolved`, `question/requested`, `question/resolved`, `session/queue`, `session/jobs`, `session/projection`, `stream/error` |
| `/api/events.host` | `host/session-added`, `host/session-removed`, `host/session-status`, `host/agent-error`, `host/workspace-changed`, `host/workspace-removed`, `host/workspace-order-changed`, `host/archived-sessions-changed`, `host/remote-event`, `stream/error` |

Client up-messages are rejected with `close(1008, 'downlink only')`. Reconnect both streams on any disconnect (one generation failure rebuilds both).

### B4. Trust boundary (important for a local TUI client)

- Every `/api` request's `Host` header must be a loopback authority or a configured `trusted-host`.
- With an `Origin` marker present, it must equal the Host authority; `sec-fetch-site: cross-site` is rejected (DNS-rebinding defense).
- **Privileged methods are loopback-only**: `agentPreset.read/copy/openDocument/remove`, `host.pickDirectory`, `host.openPath`, `settings.*`, `credentials.*`, `llm.discoverModels`.
- Request body limit: 160 MiB default.

---

## C. JSON-RPC SDK (stdio, separate process)

`packages/sdk/` (protocol / server / client). Transport: **newline-delimited JSON-RPC 2.0**
over the child process's stdio (`stdout` carries only frames).

| Direction | Method | Params → Result |
|---|---|---|
| c→s | `initialize` | `{ cwd, provider, model, maxTokens? }` → `{ serverInfo }` |
| c→s | `session/prompt` | `{ sessionId, contentBlocks }` → `{ messageId }` (queued receipt) |
| c→s | `shutdown` | — → `{}` |
| s→c | `session.event` | `{ sessionId, event: SessionEvent }` (full log, unfiltered) |
| s→c | `session.status` | `{ sessionId, status: 'idle'|'running' }` |
| s→c | `subagent.started` / `subagent.finished` | child session events |

Limits: no protocol version negotiation; **no cancel / session-close method** (abandoning a
turn = closing the runtime process); server→client requests are a dead capability (reserved
for future approval flows).

Client library: `@deepseek-ai/dsh-sdk-client` — high-level `DeepSeekHarness` (launches the
child, `run(input)` waits for whole-agent idle) or low-level `HarnessClient`
(`start()/initialize()/prompt()/request()/subscribe()/close()`). Python counterpart in `python/`.

---

## D. Forwarded host events (`ctx.remote.$on` whitelist)

`API_REMOTE_FORWARDED_EVENTS` (`packages/api/remotes/src/remote-events.ts`):
`agent-preset/selected`, `commands/change`, `credentials/updated`, `cordis/request-run`,
`cordis/request-run-resolved`, `cordis/dynamic-package`, `cordis/dynamic-retract`,
`cordis/inspect-query`, `cordis/inspect-query-resolved`, `llm/adapters-updated`,
`settings/document-updated`.
