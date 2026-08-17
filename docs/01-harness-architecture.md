# 01 — DeepSeek Harness Architecture

Source: `docs/architecture.md` (copied to `docs/official/reference/architecture.md`), `docs/cordis-primer.md`, `docs/api-gateway.md`, `AGENTS.md`.

## The spine: Cordis + everything-is-a-plugin

- **Cordis** (vendored at `vendor/`, package `@deepseek-ai/cordis`) is the plugin framework underneath.
- Plugins contribute **services**, **typed events**, and **reversible effects** to a shared **Context**.
- **Every part of the product is a plugin**: the model adapter (`ctx.llm`), the tool registry (`ctx.tools`), the session log (`ctx.sessions`), the agent loop (`ctx.agentLoop`), the HTTP server (`ctx.webServer`), the Web UI (`dsh-web-app` bundle) — all replaceable from configuration.
- There is no privileged core to patch: you extend dsh by **mounting a plugin beside the others**; registrations are effects that unwind when their plugin unloads.

## Core packages

| Package (`packages/core/...`) | Owns | `ctx` key |
|---|---|---|
| `session/` | The append-only `SessionEvent` log and in-memory store — single source of truth | `ctx.sessions` |
| `system-prompt/` | Prompt-section and tool-schema assembly | `ctx.systemPrompt` |
| `tools/` | Scoped tool registry and guarded execution pipeline | `ctx.tools` |
| `agent/` | The `Agent` interface, live registry, initiator scope, `agent/*` events | `ctx.agents` |
| `agent-loop/` | The concrete default driver implementing the `Agent` contract | `ctx.agentLoop` |
| `scope/` | Per-agent scoped-registration primitive | library, no key |

## Profiles and bundles (composition model)

A running `dsh` is a plugin tree composed at boot from **ordered layers**:

```
profile directory:  $DSH_HOME/profiles/<name>/  ($DSH_HOME defaults to ~/.dsh)
  ├── package.json       # dsh.profile manifest: ordered "bundles" list; pnpm-managed deps
  └── cordis.patch.yml   # user's own patch layer

bundle package:  package.json with "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

Layer order (later wins per row):
1. Each bundle patch in the profile's `dsh.profile.bundles` list order (`@deepseek-ai/dsh-base` first).
2. The profile's own `cordis.patch.yml`.
3. Home-level `$DSH_HOME/cordis.patch.yml`.
4. Each `--patch <path>` overlay in argv order.

Semantics:
- A patch **inserts** rows (`- insert: [{ id, name, config, ... }]`) or **overrides** rows by `id` (replacing the whole `config`, **not deep-merging**).
- Later layers win per row.
- `!!js` expressions in config are evaluated lazily after declared injections are ready (`!!js ctx.webStartup.port ?? 3080`), or against the loader context for `disabled`.
- In-box bundle names resolve from the dsh installation; pnpm manages only out-of-tree packages.

## Turn flow (what the TUI renders)

A **step** = one model request + the tools it calls. A **turn** = zero or more steps.

```
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step                   reject | enter(messages)
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
  -> agent/turn-stopping
turn/end
```

- `turn/*`, `step/*`, `user/message`, `assistant/*`, `tool/*`, `steering/message`, `todo/write`, `request/header` are **durable session events** (broadcast via `session/event`).
- `agent/*` events are **live** extension points (waterfalls: `agent/pre-step`, `agent/request`, `llm/stream`, `tools/pre-execute`, `tools/execute`, `tools/post-execute` — listeners MUST call `next()`; serial: `agent/turn-stopping`).
- **Model-visible means logged**: anything that reaches a model request must be reconstructable from the session log. UI renders from `session/event`, never from live-only data.

## Session log

- `Session` is an **append-only log** of typed `SessionEvent`s; LLM history is derived (`deriveMessages()`), not stored separately.
- Events carry monotonic `seq`, `time`, `type`-discriminated `data`. Extensible via `SessionEventMap` declaration merging.
- Persistence: `SessionPersistence` interface (JSONL/SQLite), `session/flush` checkpoint, `SessionHeader`.

## Capability seams (three roles)

A **seam** = Service Definition + Service Provider + Consumer (usually a model-facing tool).
E.g. Bash: `dsh-shell` (definition) / `dsh-bash-local` (provider) / `dsh-tool-bash` (consumer tool).
Swapping the provider changes the whole product. A package may own more than one role; one role alone is not a seam.

## The Agent handle (the object TUI drives)

```ts
interface Agent {
  readonly id: SessionId
  readonly options: AgentOptions        // provider, model, maxTokens
  readonly session: Session
  readonly inbox: Inbox                 // next-turn | next-step lists
  readonly status: AgentStatus          // 'idle' | 'running'
  readonly ctx: Context                 // agent-scoped context
  cancel(cause: AgentCancelCause, options?: CancelOptions): void
  whenIdle(): Promise<void>
  runMaintenance<T>(task): Promise<T>
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void
  followup(message: UserMessage): void  // queue a turn + wake
  steer(message: UserMessage): void     // steering for nearest step
  inject(message: UserMessage): void    // model-facing context, no wake
}
```

## Extension points for UI ("Add UI or editor integration")

> **drive `ctx.agents` and render from `session/event`**

Other extension points a TUI uses: `ctx.commands` (human commands), `ctx.userQuestions`, `ctx.approval`, `ctx.goals`, `ctx.llm` (model list), `ctx.skills`, `ctx.sessionQuery`, `ctx.systemPrompt.assemble()`, `ctx.tools.get()`, `ctx.tokenMeter`, `ctx.workspaceRegistry`, `ctx.settings`, `ctx.credentials`.

## Full service key list (from generated subsystem pages)

`ctx.agentDefaultModel`, `ctx.agentLoop`, `ctx.agentPresets`, `ctx.agents`, `ctx.apiProxy`,
`ctx.approval`, `ctx.attachments`, `ctx.clientModules`, `ctx.codeRuntime`, `ctx.commands`,
`ctx.compaction`, `ctx.cordisInspect`, `ctx.credentials`, `ctx.directoryPicker`,
`ctx.dynamicCordisRunner`, `ctx.fs`, `ctx.goals`, `ctx.invariants`, `ctx.jobs`, `ctx.llm`,
`ctx.lsp`, `ctx.messageFeedback`, `ctx.permissionPresets`, `ctx.planMode`, `ctx.sandbox`,
`ctx.sandboxPolicy`, `ctx.sessionPersistence`, `ctx.sessionProjectionCache`,
`ctx.sessionProjections`, `ctx.sessionQuery`, `ctx.sessionReferenceResolver`,
`ctx.sessionTelemetry`, `ctx.sessionTitle`, `ctx.sessions`, `ctx.settings`, `ctx.shell`,
`ctx.shellEnv`, `ctx.skills`, `ctx.spillStore`, `ctx.storage`, `ctx.storageDomain`,
`ctx.subagents`, `ctx.subprocess`, `ctx.systemPrompt`, `ctx.terminals`, `ctx.tokenMeter`,
`ctx.toolResultPruner`, `ctx.tools`, `ctx.typert`, `ctx.typertGateway`, `ctx.userQuestions`,
`ctx.web`, `ctx.webServer`, `ctx.workflowEngine`, `ctx.workspaceRegistry` (+ `ctx.e` framework).

Agent events: `agent/created`, `agent/disposed`, `agent/error`, `agent/inbox/*`,
`agent/pre-step`, `agent/request`, `agent/request-error`, `agent/session-start`,
`agent/status`, `agent/turn-stopping`.

See `docs/official/subsystems/*.md` for generated signatures of each service.
