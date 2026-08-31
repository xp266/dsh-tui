English | [中文](plugin-author-guide.zh.md)

# dsh-tui Extension Points

## Mounting

Declare a bundle manifest in your package, then install it into a profile with one command:

```jsonc
// package.json
{ "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```

```yaml
# cordis.patch.yml
- insert:
    - id: my-plugin
      name: my-plugin
```

```sh
dsh plugin --profile <name> add <package-path>
```

## Wiring

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDef } from 'dsh-tui/contract'

export const name = 'my-plugin'

export function apply(ctx: Context): void {
  ctx.inject(['tui'], scope => {
    scope.effect(() => scope.tui.commands.register(deploy satisfies CommandDef))
  })
}
```

- Importing any type from `dsh-tui/contract` gives you the fully typed `ctx.tui` (the entry is types-only; its runtime module is empty, so you can never fork the internal registries).
- Every `register` returns a disposer; registrations unwind with the plugin's own fiber. Re-registering the same key layers an override on top, and disposal restores the layer beneath.
- `tui.interactions` / `tui.chat` are `undefined` until the chat bridge is ready.

## Contribution points

### tui.windows.register

```ts
tui.windows.register({
  id: 'metrics',
  title: 'Metrics',
  command: { name: 'metrics', description: 'Show metrics' },
  required: ['metrics'],
  component: ({ open, onClose }) => <MetricsDialog visible={open} onClose={onClose} />,
})
```

- Component props: `{ open, onClose, handleRef? }`; rendered in the dialog layer (reuses the close guard and mouse selection).
- `command` becomes a slash command of the same name; `required` lists window services the window depends on — it renders only once they exist.

### tui.commands.register

```ts
tui.commands.register({
  id: 'deploy',
  command: '/deploy',
  description: 'Run the deploy pipeline',
  hint: '[env]',
  args: ['staging|production'],
  run: () => {},
})
```

- Without `run`, the command opens the window or overlay registered under the same `id`.
- `args` supplies literal argument completions; `hint` shows in the input hints.

### tui.tools.register

```ts
tui.tools.register({
  tool: 'deploy',
  call: ({ args, cwd }) => ({ label: `deploy[${String((args as { env?: string }).env)}]`, body: '' }),
  result: ({ result }) => ({ kind: 'replace', text: String((result.meta as { summary?: string }).summary ?? '') }),
})
```

- Keyed by tool name; takes precedence over the harness tool's own presentation, falls back when the contribution returns `undefined`.
- `call` context: `{ tool, callId, args, argumentsRaw, cwd }`; `result` adds `result: { content, isError, meta? }`.
- Result shape: `{ kind: 'replace' | 'append', text, bodyCol?, exitCode?, signal?, diff? }`; `diff` only takes effect for diff-class tools.
- The `write`/`edit` diff views and the `ask_user_question`/`todo`/plan-mode chrome are built in and bypass this registry.

### tui.content.nodes.register

```ts
tui.content.nodes.register({
  id: 'my-progress',
  match: event => (event as { type: string }).type === 'my-plugin/progress',
  start: () => ({ view: 'my-progress', data: { phase: 'start' } }),
  update: (event, message) => {
    const phase = (event as { data: { phase?: string } }).data?.phase
    return phase === 'abort' ? null : { view: message.view, data: { phase } }
  },
})
```

- A `match` hit claims the event (the builtin reduction skips it); `start` produces one custom message.
- Later events in the same turn go to `update`; returning `null` removes the message. `turn/end` clears the claims and settles `running`/`streaming`.

### tui.content.views.register

```ts
tui.content.views.register({
  view: 'my-progress',
  render: ({ message }) => ({ label: 'Deploy', lines: [`phase: ${String((message.data as { phase?: string }).phase)}`], muted: false }),
})
```

- `render` context: `{ message: CustomMessage, width }`; returns `{ label?, lines, wrap?, muted? }`.
- `lines` wrap to width; `wrap: false` preserves them verbatim. Messages without a registered view render as JSON.

### tui.chrome.statusLine.register

```ts
tui.chrome.statusLine.register({ id: 'clock', render: ({ columns }) => new Date().toLocaleTimeString() })
```

- Returns one line of text (ANSI allowed); contributions join after the status text on the left side, ordered by `order`.

### tui.chrome.overlays.register

```ts
tui.chrome.overlays.register({ id: 'banner', render: ({ onClose }) => <Banner onClose={onClose} /> })
```

- Renders while the overlay stack's top id equals `id`.

### tui.chrome.widgets.register

```ts
declare module 'dsh-tui/contract' {
  interface DialogItemKinds {
    item: { type: 'gauge'; label: string; value: number }
  }
}

tui.chrome.widgets.register('gauge', {
  height: () => 1,
  paintWidth: () => 10,
  render: ({ item }) => <Text>{`${item.label} ${'#'.repeat(item.value)}`}</Text>,
})
```

- Registers a `WidgetDef` keyed by the DialogItem `type`: `height`/`paintWidth`/`render` are required; interaction hooks (`stops`/`caret`/`onEnter`/`onClick`/…) are optional.
- Declare new item kinds through `DialogItemKinds` module augmentation to extend the `DialogItem` union.

### tui.chrome.palette.register

```ts
tui.chrome.palette.register({ id: 'solarized', mode: 'dark', colors: { userBubbleBackground: '#073642' } })
```

- `mode`: `'dark' | 'light' | 'both'` (default both); keys are palette color names.
- Applies immediately; disposal restores. Hot-swaps with hmr.

### tui.chrome.keys.register

```ts
tui.chrome.keys.register({
  id: 'quick-save',
  handle: (input, key) => (key.ctrl && input === 's') ? (save(), true) : false,
})
```

- Dispatched by `order` before builtin shell handling (including the ignore-while-dialog-open logic); returning `true` consumes the key.
- `TuiKey` is structurally compatible with ink's `Key`; it can consume every key, Ctrl+C included.

### tui.services.register

```ts
tui.services.register('metrics', createMetricsStore())
```

- Windows declare dependencies via `required: ['metrics']` and consume them with `useWindowService('metrics')` on the render side.

### tui.interactions

```ts
tui.interactions.panels.register({
  kind: 'my-confirm',
  component: ({ request, resolve, reject, active, onResize }) => <ConfirmPanel request={request} />,
})

const answer = await tui.interactions.push('my-confirm', { prompt: 'ok?' }, signal)
```

- `panels.register` registers a modal panel component by `kind`, with props `{ request, resolve, reject, active, columns, rows, innerWidth, blockWidth, background, handleRef?, onResize }`.
- `push(kind, request, signal?)` raises one modal interaction; the promise settles with the panel's `resolve`/`reject`, and `signal` aborts it.

### tui.startup.registerSink

```ts
tui.startup.registerSink({ id: 'my-startup-log', write: line => { process.stdout.write(`tui: ${line}\n`) } })
```

- Receives the shell's line-by-line boot progress; registration replays lines already emitted, and nothing is written after boot ends. Multicast.

### tui.chat

```ts
await tui.chat.send('hello')
await tui.chat.listSessions()
const off = tui.chat.onEvent(event => {})
```

- Methods: `send`/`interrupt`/`newSession`/`openSession`/`listSessions`/`onEvent`/`cwd`/`activeSessionId`.

## Configuration

```yaml
- id: tui
  name: dsh-tui
  config:
    theme: dark            # auto | dark | light
    maxFps: 120
    bootListTimeout: 10000
    alternateScreen: true
```

Third-party plugins follow the cordis convention of exporting their own `Config` schema and `apply(ctx, config)`.
