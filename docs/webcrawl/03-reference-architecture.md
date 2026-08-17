# Webcrawl: DeepSeek Harness Architecture (official site, en) — Reference

Crawled from https://deepseek-harness.github.io/deepseek-harness/en/reference/
(Canonical markdown source: `docs/architecture.md` in the harness repo — copied to `docs/official/reference/architecture.md`.)

## Content

Read this before changing anything under `packages/`. Assumes Cordis knowledge; start with the primer or tutorial otherwise.

### Cordis

Cordis is the framework under dsh: plugins contribute services, typed events, and reversible effects to a shared context. **Every part of the product is a plugin**, including the model adapter, the tool registry, the session log, and the agent loop itself, so every part is replaceable from configuration. There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads.

### Profiles and bundles

A running `dsh` is a plugin tree composed at boot from ordered layers.

- **Profile** = named composition stored in the Harness home (`$DSH_HOME/profiles/<name>`). Lists the bundles it stacks, holds out-of-tree plugins it installs, and keeps the user's own `cordis.patch.yml`. `web` and `headless` ship as templates.
- **Bundle** = distribution format for Cordis config rows and the code they mount; whatever it inserts stays patchable by layers above it.
- Each declares itself in its own `package.json` under a `dsh` field: `dsh.profile` (a profile's bundles) and `dsh.bundle` (a bundle's patch file).
- `dsh-base` is the first layer of every profile; `dsh-web-app` adds the browser application; `dsh-headless` adds a one-shot runner with no server.
- Layers apply to an empty entry list in order: each bundle in listed order → profile's `cordis.patch.yml` → home-level `$DSH_HOME/cordis.patch.yml` → each `--patch` overlay. A patch targets a row by id and replaces its whole config, or inserts new rows.
- Inspect: `dsh --profile web --dump-config`

### Core packages

| Package | Owns | `ctx` key |
|---|---|---|
| core/session | The append-only `SessionEvent` log and in-memory store | `ctx.sessions` |
| core/system-prompt | Prompt-section and tool-schema assembly | `ctx.systemPrompt` |
| core/tools | The scoped tool registry and guarded execution pipeline | `ctx.tools` |
| core/agent | The `Agent` interface, live registry, and `agent/*` events | `ctx.agents` |
| core/agent-loop | The default driver implementing that interface | `ctx.agentLoop` |
| core/scope | The per-agent scoped-registration primitive | library, no key |
| llm/llm | Message and stream vocabulary plus the adapter seam | `ctx.llm` |

### Events

- **Session events** are durable facts appended to the log and broadcast through `session/event` (survive reload).
- **Agent events** (`agent/*`) carry a live `Agent`: inbox, step, status, request, validation, continuation.
- **Capability events** attach policy and adapters to a seam (`fs/*`, `tools/*`, `telemetry/*`).

### Turn flow

A **step** is one model request plus the tools it calls. A **turn** is zero or more steps.

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

`turn/*`, `step/*`, `user/message`, `assistant/*`, and `tool/*` are durable session events; the rest are live extension points. `agent/pre-step`, `agent/request`, `llm/stream`, and the three `tools/*` events are waterfalls (listeners must call `next()`); `agent/turn-stopping` is serial.

### Session log

The session log is the source of the context the model sees. `deriveMessages()` projects model history from it. **Model-visible means logged** — anything that reaches a model request must be reconstructable from the log.

### Capability seams

A **seam** = Service Definition (interface) + Service Provider (implementation) + Consumer (usually a model-facing tool). Seams are why one provider swap changes the whole product.

### Where new behavior goes

| Goal | Mechanism |
|---|---|
| Add a model provider | register its adapter on `ctx.llm` |
| Add a model-facing capability | register on `ctx.tools` |
| Give one session a different capability set | compose an agent preset; a service row needs an `isolate` realm |
| Add shell execution | register a `ctx.shell` backend; local one spawns through `ctx.subprocess` |
| Add persistent terminal execution | register a `ctx.terminals` backend plus `dsh-tool-terminal` |
| Add a human command | register on `ctx.commands` |
| Add background work | register on `ctx.jobs` |
| Add filesystem access or policy | register a `ctx.fs` provider or listen to `fs/*` events |
| Confine spawned processes | use a `ctx.sandbox` backend |
| Intercept a request, tool, or turn | use its `agent/*` or `tools/*` event |
| Add model-facing context | call `agent.inject()` |
| **Add UI or editor integration** | **drive `ctx.agents` and render from `session/event`** |
| Add durable session state | extend `SessionEventMap` |
| Generate session titles | register the sole `ctx.sessionTitle` provider |
| Manage a same-session objective | use `ctx.goals` |
| Fork a live session | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| Scope a registration to one agent | use that agent's `agent.ctx` |
