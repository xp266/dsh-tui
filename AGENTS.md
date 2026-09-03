# AGENTS.md

## Code Style

- Erasable TypeScript syntax only (no enum, namespace, or parameter properties); imports always carry the `.ts` extension.
- Exported functions declare explicit return types; internal functions rely on inference.
- No import aliases, no star imports; import the module itself and access members with dot notation for namespace semantics.
- Prefer `const`; use ternaries or early returns instead of reassignment; never write `else`.
- Avoid unnecessary destructuring; dot notation preserves context.
- Inline values used only once; inline single-line helpers with a single call site; place helpers directly below the main function.
- No `any`; prefer map/filter/flatMap over loops; use type guards in filter to preserve downstream inference.
- Comments only for non-obvious constraints and surprising behavior, never restating code, never casually.
- `try`/`catch` only at I/O boundaries; every catch block must carry a comment stating why the error is swallowed.

## Commit Style

- Conventional commits: `type(scope): summary`; type is one of feat/fix/docs/chore/refactor/test; scope optional, the affected area.
- English, imperative mood, lowercase start, no trailing period.
- No emojis, no AI attribution footers ("Generated with…" and the like).
- Branches: `type/topic` short names, topic hyphen-separated, at most three words.

## Hard Constraints

- Never commit, push, or open PRs proactively; only when the user explicitly asks.
- Never create README.md or new documentation files; never modify this document unless necessary.
- Never use ink patches; stock ink only.
- Never store temporary files in the repository; throwaway scripts go to `/tmp`.
- Upstream version comparison lives only in `src/contract/upstream.ts`; adjusting the floor/ceiling must land in the same commit as the package.json peer branches.
- Stage explicit paths only; never `git add -A` or `git add .`.

## General Constraints

- Before the first action of a session, review the codebase structure and the contents of `docs/`.
- Answer questions before touching code; read files in full before wide-ranging changes, do not rely on search snippets.
- After completing a feature or fix, run `pnpm typecheck`, `pnpm build`, and `pnpm verify` in order.
- Verify behavior with throwaway probe scripts (tsx against source), never by creating test files.
- Keep replies short, technical, and direct; no pleasantries, no emojis; state agreement or disagreement before describing changes.
- When unrelated changes appear before committing, ask the user how to handle them.
- When user instructions conflict with this document, confirm with the user first.
