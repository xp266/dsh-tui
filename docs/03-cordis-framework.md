# 03 — Cordis Framework Essentials (cheat sheet)

Sources: `docs/official/reference/cordis-primer.md`, `docs/official/cordis-tutorial/` (7 lessons),
`docs/official/develop/events.md`, `docs/official/develop/service.md`.

## Cordis in five ideas

1. **A plugin is an object that implements Service** — a function with optional `inject`/`apply(ctx)`, or a `Service` subclass.
2. **A context is a repository of services** — a service claims a stable `ctx.<key>` (`ctx.tools`, `ctx.llm`, `ctx.sessions`).
3. **Declare service dependency via `inject`** — load order is expressed through service requirements, not boot sequencing.
4. **Typed Events** — declared via TS declaration merging, dispatched as `emit`/`waterfall`/`parallel`/`serial`.
5. **Registrations are reversible effects** — installed through `ctx.effect()`/`ctx.on()` so reload and teardown unwind predictably.

## Dispatch modes

| Mode | Awaited? | Order | Return value? | Call |
|---|---|---|---|---|
| `emit` | No | registration order | No | `ctx.emit` |
| `waterfall` | No | registration order | Yes | `ctx.waterfall` |
| `parallel` | Yes | all in parallel | No | `ctx.parallel` |
| `serial` | Yes | registration order | Yes | `ctx.serial` |

**Waterfall semantics**: listener receives `(...args, next)`; must call `next()` to delegate (omitting short-circuits — by design, for interception). Cooperative listeners usually mutate a shared request then delegate. `prepend: true` runs a listener before ordinary registrations.

## Services

- Provide: `class X extends Service { constructor(ctx){ super(ctx, 'x') } }` + declaration merge.
- Consume: `export const inject = ['x']` (required) or `ctx.get('x')` (optional).
- Service isolation: `cordis-plugin-group` rows with `isolate: { shell: true }` give separate plugin groups separate instances.
- If a required service disappears: dependents dispose automatically, reload when it returns.

## Loader config (`!!js`)

- `cordis-plugin-include` parses `!!js` into expression nodes.
- Entry `config` is interpolated **after declared injections activate**, against that plugin's context (`ctx.serviceName`); `disabled` is evaluated at every mount decision against the loader context.
- Other entry metadata stays literal. Use **overlays** (`--patch`, profile patches) when environment selects plugins.

## Lifecycle states

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

- `fiber.dispose()` guarantees: all owned registrations removed, child plugins recursively unloaded, promise resolves after async cleanup.
- HMR (`cordis-plugin-hmr`): edit file → unload old → load new → run new apply.

## Practical rules

- Tool pipeline events belong to `ctx.tools`, model streaming to `ctx.llm`, live agent coordination to `ctx.agents`.
- Prefer events for interception/policy; prefer service methods for direct capability calls.
- Every registration needs a disposer; if teardown order matters, keep related work in one `ctx.effect()`.
