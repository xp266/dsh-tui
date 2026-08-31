English | [中文](plugin-author-guide.zh.md)

# dsh-tui Extension Points

Every user-facing surface of the TUI is a keyed contribution registry. Plugins
mount through the standard cordis bundle mechanism, obtain the `tui` service,
and register contributions that can be added, layered, and removed at any time
at runtime.

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
- Markdown and special-field registrations additionally invalidate the render caches and re-render the surface; window/tool/view/palette registrations re-render through the same path.
- `tui.interactions` / `tui.chat` are `undefined` until the chat bridge is ready.

## Contribution map

| Face | What you can contribute |
|---|---|
| `tui.windows` | dialog windows (with optional slash commands) |
| `tui.services` | data stores consumed by windows |
| `tui.commands` | slash commands with hints and argument completion |
| `tui.chrome.statusLine` | status bar lines |
| `tui.chrome.overlays` | full-screen overlays |
| `tui.chrome.widgets` | dialog item widget kinds |
| `tui.chrome.palette` | theme colors (dark/light/both) |
| `tui.chrome.keys` | global key bindings (before builtin shell handling) |
| `tui.tools` | tool call/result presentations |
| `tui.content.nodes` | custom bubbles driven by session events |
| `tui.content.views` | custom bubble renderers |
| `tui.markdown.blocks` | block-level markdown renderers |
| `tui.markdown.inline` | inline (span) markdown renderers |
| `tui.markdown.languages` | code fence grammars (Prism) |
| `tui.composer.paste` | paste interception/transformation |
| `tui.composer.keys` | composer key interception |
| `tui.composer.insert` | programmatic insertion into the live composer |
| `tui.fields` + `tui.fields.factory` | special field kinds and instances |
| `tui.interactions` | modal panels + programmatic push |
| `tui.startup` | boot progress sinks |
| `tui.chat` | send (text + image groups), sessions, event tap |

## Windows, widgets, and data

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

- Registers a `WidgetDef` keyed by the DialogItem `type`: `height`/`paintWidth`/`render` are required; interaction hooks (`stops`/`caret`/`onLeftRight`/`onEnter`/`onSpace`/`onClick`/`activate`/`searchTexts`/`fullRowFocus`/`selectable`/`editable`) are optional.
- Declare new item kinds through `DialogItemKinds` module augmentation to extend the `DialogItem` union.

### tui.services.register

```ts
tui.services.register('metrics', createMetricsStore())
```

- Windows declare dependencies via `required: ['metrics']` and consume them with `useWindowService('metrics')` on the render side.

## Input

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

### tui.composer.paste.register

```ts
tui.composer.paste.register({
  id: 'ticket-url',
  order: 10,
  handle: ({ text, cursor }) => {
    if (!/^TICKET-\d+$/.test(text.trim())) return undefined
    const char = tui.fields.factory.create({ kind: 'ticket', label: `[${text.trim()}]` })
    return { insert: char ?? text }
  },
})
```

- Handlers run in `order` before the builtin paste classification (image paths, long-paste summaries).
- Return `{ insert }` to claim the paste; the inserted text still passes through the builtin field classification, so you can return a path or plain text and let the builtins chip it.
- Return `undefined` to fall through to the next handler and then the builtin pipeline.

### tui.composer.keys.register

```ts
tui.composer.keys.register({
  id: 'submit-with-meta',
  handle: (input, key) => {
    if (key.meta && key.return) { send(); return true }
    return false
  },
})
```

- Runs for every key the composer would consume, before builtin composer handling (typing, arrows, backspace, send). Only while the composer is interactive (no dialog or panel on top).
- Return `true` to consume; `false` lets builtin handling proceed.

### tui.composer.insert

```ts
tui.composer.insert({ text: 'draft: ' })
tui.composer.insert({ field: { kind: 'ticket', label: '[T-42]', data: 42 } })
```

- Inserts at the composer cursor exactly like user input; returns `false` when the composer cannot accept input right now (a dialog or panel is open).
- Field inserts behave like user-typed chips: atomic cursor movement, whole-chip deletion, unsplit wrapping.

## Content

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

## Markdown extensions

### tui.markdown.blocks.register

```ts
tui.markdown.blocks.register({
  type: 'code',
  render: (token, { width, palette }) => {
    const code = (token as { text: string }).text
    return wrapSegments([{ text: code, style: palette.codePlain }], width)
  },
})
```

- Keyed by the marked token `type` (`code`, `heading`, `table`, `blockquote`, `list`, `html`, ...). Registering over an existing type replaces that layer; disposal restores it.
- `render` receives the raw marked token and `{ palette, thinking, width, streamId }`; return `Segment[][]` (one array of styled segments per rendered row). Rows are cached by token content — registering/disposing clears the cache automatically.
- A plugin may also introduce a token type the builtin lexer never emits; pair it with a marked extension applied on your side if needed.

### tui.markdown.inline.register

```ts
tui.markdown.inline.register({
  type: 'codespan',
  render: (token, { palette, base }) => ({ text: (token as { text: string }).text, style: base ?? palette.inlineCode }),
})
```

- Checked for every inline token before the builtin span switch; the returned single `Segment` is appended into the surrounding flow (wrapping and run merging still apply).

### tui.markdown.languages.register

```ts
import MyLang from 'prismjs/components/prism-my-lang'

tui.markdown.languages.register({ id: 'my-lang', grammar: MyLang, aliases: ['ml'] })
```

- Registers a Prism grammar so ```` ```my-lang ```` fences highlight immediately; `aliases` are accepted as synonyms. Clearing the highlight cache happens for you.

## Special fields

Special fields are inline chips rendered inside the composer and message
bubbles. A field occupies a single internal code point: cursor movement and
deletion treat it atomically and line wrapping never splits it. Fields carry
their own style (`color`, `background`, optional `bold`) resolved at render
time, so theme switches apply to existing chips.

### tui.fields.register (field kinds)

```ts
tui.fields.register({
  kind: 'ticket',
  style: () => ({ color: '#101010', background: '#ffae00', bold: true }),
  expand: data => `[ticket ${String(data)}]`,
})
```

- `style()` is re-read on every render (theme-aware).
- `expand(data)` maps a field instance to the text that is injected into the
  sent message. Without `expand`, the label is sent as-is.
- Builtins: `image` (orange `[n images]`, becomes real image attachments) and
  `paste` (orange `[n lines]` / `[n characters]`, expands to the full pasted
  text). Both are composed with the same machinery.

### tui.fields.factory + tui.composer.insert (field instances)

```ts
const char = tui.fields.factory.create({ kind: 'ticket', label: '[T-42]', data: 42, owner: 'composer' })
tui.composer.insert({ field: { kind: 'ticket', label: '[T-42]', data: 42 } })
```

- `create` returns the single-character sentinel to splice into composer text yourself, or `null` when the sentinel pool is exhausted (then fall back to the label text).
- `composer.insert({ field })` is the convenient path: it allocates and inserts at the cursor in one step.
- `owner` controls reclamation: `'composer'` chips are released as their text leaves the composer, `'message'` chips live for the message list's lifetime.
- Factory also exposes `release(char)`, `isFieldChar(char)`, and `labelOf(char)`.

## Chrome

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
- For keys inside the text input, use `tui.composer.keys` instead.

## Panels, startup, chat

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
tui.chat.send('see attachment', [[{ kind: 'path', path: '/tmp/diagram.png' }]])
tui.chat.send('clipboard shot', [[{ kind: 'data', data: bytes, mediaType: 'image/png', name: 'clipboard' }]])
await tui.chat.listSessions()
const off = tui.chat.onEvent(event => {})
```

- Methods: `send`/`interrupt`/`newSession`/`openSession`/`listSessions`/`onEvent`/`cwd`/`activeSessionId`.
- `send` accepts image groups: each inner array becomes one `[n images]` chip in the rendered message; a `path` image is read from disk, a `data` image is uploaded as-is. The model receives real image parts.

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
