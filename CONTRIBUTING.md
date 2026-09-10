# Contributing

English | [中文](CONTRIBUTING.zh.md)

Thanks for your interest in dshtui. This project is a terminal UI plugin for
DeepSeek Harness; bug reports, feature requests, and pull requests are welcome.

## Before you start

- Read [AGENTS.md](AGENTS.md) — it documents the code style this repository
  enforces and the constraints that keep the plugin compatible with its host.
- Open an issue first for large changes, so the approach can be agreed on
  before you write code.

## Development setup

Requirements: Node.js `^22.19.0 || >=24.0.0` and pnpm.

```sh
git clone https://github.com/xp266/dsh-tui.git
cd dsh-tui
pnpm install
```

## Checks

Run the same gates CI runs before opening a pull request:

```sh
pnpm typecheck
pnpm build
pnpm verify
```

- `typecheck` — `tsc --noEmit`.
- `build` — bundles `src/` into `lib/` with tsdown.
- `verify` — the upstream compatibility contract, the optional peer
  declarations, and the built package targets.

## Commits and branches

- Conventional commits: `type(scope): summary`, with `type` one of
  `feat`/`fix`/`docs`/`chore`/`refactor`/`test`.
- English, imperative mood, lowercase start, no trailing period.
- No emojis and no AI attribution footers.
- Branches: `type/topic`, hyphen-separated, at most three words.

## Pull requests

- Keep the diff focused; unrelated changes belong in their own PR.
- Describe the behavior change and how you verified it. There is no unit-test
  suite: the verify gates plus a manual run against a dsh profile are the
  checks.
- When behavior changes, update the docs in both languages
  (`README.md`/`README.zh.md` and
  `docs/plugin-author-guide.md`/`docs/plugin-author-guide.zh.md`); the pairs
  are kept structurally in sync.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
