# dsh-tui — Documentation Index

Research and reference pack for deepseek-harness. Everything here was gathered
so that later development agents do **not** need to re-read the harness source
or the official website.

## Contents

1. [01-harness-architecture.md](./01-harness-architecture.md) — how deepseek-harness is designed ("everything is a plugin"), profiles, bundles, seams.
2. [03-cordis-framework.md](./03-cordis-framework.md) — Cordis framework essentials: lifecycle, services, events, HMR, cleanup.
3. [05-backend-interfaces.md](./05-backend-interfaces.md) — every backend interface the harness exposes: HTTP RPC map, WebSocket downlinks, Typert Gateway, SDK JSON-RPC, Cordis services, events.
4. [06-communication-paths.md](./06-communication-paths.md) — the three ways a TUI can talk to the harness, with trade-offs.
5. [08-cli-profile-bundle.md](./08-cli-profile-bundle.md) — the `dsh` CLI, profiles, bundles, startup instructions, app-owned command line.
6. [09-key-source-paths.md](./09-key-source-paths.md) — index of critical source paths inside the harness repo.

## Reference material (copied from the harness repo / official site)

- `official/develop/` — official plugin-development docs (`basic/`, `framework/`, `practice/`), English markdown source.
- `official/cordis-tutorial/` — the 7-step Cordis framework tutorial (English).
- `official/reference/` — architecture, cordis-primer, api-gateway, capability-seams, config-catalog, tool-catalog, persistence-catalog.
- `official/subsystems/` — the generated per-subsystem reference (service surfaces, events, configs), English.
- `webcrawl/` — pages crawled from https://deepseek-harness.github.io/deepseek-harness/ (reference architecture).

## Source-of-truth locations

| What | Where |
|---|---|
| Harness source checkout | `/home/xp266/github/deepseek-harness` |
| This project | `/home/xp266/ts/dsh-tui` |
| Official docs site | https://deepseek-harness.github.io/deepseek-harness/ |
| Docs repo folder (user-facing) | `/home/xp266/github/deepseek-harness/docs/user/develop/` |
| Plugin dev tutorial (zh) | https://deepseek-harness.github.io/deepseek-harness/develop/basic/ |
| Plugin dev tutorial (en) | https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/ |