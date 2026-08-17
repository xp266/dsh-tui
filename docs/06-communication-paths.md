# 06 — TUI ⇄ Harness Communication Paths

This document maps the three ways a TUI plugin can drive the harness, with the
constraints each one implies. The final choice is a **design decision** for the
development session — this file only prepares the facts.

---

## Path A — Same-process plugin (Cordis services + events)  [turtle-ui pattern]

The TUI plugin is mounted as ordinary rows in the same Cordis tree as the agent loop
(`dsh --profile tui` composes `dsh-base` + the TUI bundle). The TUI:

- `inject = ['agents', 'sessions', 'commands', 'userQuestions', 'tools', 'llm', 'systemPrompt', ...]`
- Drives the agent directly: `ctx.agents.get(sessionId)` → `agent.followup(msg)`,
  `agent.steer(msg)`, `agent.cancel(...)`, `agent.whenIdle()`.
- Renders from `ctx.on('session/event', ...)` and `agent/status` events.
- Registers commands into `ctx.commands`, question dialogs into `ctx.userQuestions`,
  prompt sections into `ctx.systemPrompt`.
- Optional services via `ctx.get('sessionQuery')` etc.

**Pros**: zero protocol work, full fidelity (streaming chunks arrive as typed events),
no port/trust issues, works offline. This is exactly what turtle-ui does.
**Cons**: runs inside the harness process (a TUI bug can affect the agent process);
tying TUI lifecycle to agent composition; only one TUI per process.

## Path B — Remote client (HTTP `/api` + WebSocket)  [web pattern, official TUI allowance]

Run the harness with the web-like host layer (`dsh --profile web --port 3080` or a TUI
profile that mounts `api-gateway` + `connection` rows) and have the TUI implement the
**React-free `ctx.remote` contract** — the README of `packages/api/remotes` explicitly
reserves this: *"a future TUI that provides the same React-free `ctx.remote` contract"*.

The TUI would:
- `POST /api/session.prompt` (legacy envelope) and `POST /api/goals/create` (Typert `{args}`);
- subscribe to `ws://127.0.0.1:3080/api/events.mux` + `/api/events.host`;
- answer approvals/questions via `POST /api/respond`;
- respect the trust boundary: loopback `Host`, loopback-only privileged methods.

**Pros**: process isolation (TUI crashes don't kill the agent; remote/cloud hosting
possible), reuses the exact web API contract, official blessing for a TUI.
**Cons**: must re-implement a client stack (or reuse `@deepseek-ai/dsh-client-connection`
half — but that package is browser-oriented; its HTTP/WS carrier can run in Node),
no shared in-process service access, streaming fidelity depends on mux frames.

## Path C — JSON-RPC SDK (stdio child process)

Spawn the harness as a child (`@deepseek-ai/dsh-sdk-jsonrpc-server` composition) and
communicate over newline-delimited JSON-RPC on stdio; use `@deepseek-ai/dsh-sdk-client`.

**Pros**: simplest client (typed library exists), clean process boundary.
**Cons**: tiny method surface (initialize / session/prompt / shutdown + 4 notifications),
**no cancel**, no session close, no approval/question handling, no workspace/settings/
credentials APIs — cannot reach "almost all web features". Only suitable if the TUI
stays intentionally minimal.

---

## Decision guidance

| Requirement | Path A | Path B | Path C |
|---|---|---|---|
| Cover ~all web features | yes | yes | no |
| Process isolation | no | yes | yes |
| Streaming fidelity | yes (typed events) | yes (mux frames) | yes (session.event) |
| Cancel/steering | yes | yes | no |
| Approvals/questions | yes (ctx) | yes (respond RPC) | no (reserved) |
| Setup complexity | lowest | medium | lowest |
| Official precedent | turtle-ui | web + reserved TUI contract | sdk examples |

Note: Path A and Path B are not mutually exclusive — a TUI bundle could mount both its
own process-level rows AND the web host rows, then call out to itself over HTTP if needed.
The web host rows themselves (`api-gateway`, `connection`, `webserver`) are
carrier-independent plugins that any profile may mount.
