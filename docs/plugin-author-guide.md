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

### Native windows (`dsh-tui/dialog`)

Windows registered through `tui.windows` render whatever component you give
them, but builtin windows are built on the internal Dialog stack. That stack
is exported as `dsh-tui/dialog`, so a plugin window can look and behave
exactly like a native one — theme colors, frame, title, focus navigation,
search, footer, mouse click/wheel, and the close guard:

```ts
import { Dialog, React } from 'dsh-tui/dialog'
import { useStdout } from 'dsh-tui/vendor'

function MyWindow({ open, onClose, handleRef }) {
  if (!open) return null
  return (
    <Dialog
      ref={handleRef}
      width={56}
      maxHeight={16}
      title="my window"
      rows={[
        { items: [{ type: 'button', label: 'Do it', onPress: () => {} }] },
      ]}
      footer={[{ text: 'enter confirm · esc close', dim: true }]}
      onClose={onClose}
    />
  )
}
```

Dialog items (`static`/`button`/`select`/`input`/`checkbox`/`actions`/
`header`/`search`) cover most window shapes; custom item kinds register
through `tui.chrome.widgets`.

### Shared react/ink runtime (`dsh-tui/vendor`)

Components contributed to windows, widgets, overlays, or panels render inside
dsh-tui's React tree, so they must run on dsh-tui's own react and ink
instances. The profile module graph contains only what dsh-tui links; a plugin
that adds its own `react` dependency forks React (the fallback copies carry a
different major version) and hooks crash. Import both from the vendor entry
instead of declaring them as dependencies:

```ts
import { Box, Text, useInput, useStdout, React, useState, useEffect } from 'dsh-tui/vendor'
```

The vendor entry re-exports the react and ink APIs listed in `lib/vendor.d.mts`
and is the only supported source for React components in plugins. Note that
plugins installed via `link:` (local dev directories) resolve from their
realpath and cannot see the profile's module graph — use `file:`, tarball, or
npm installs (what `dsh plugin add` produces for published packages) so the
static import resolves.

## Contribution map

| Face | What you can contribute |
|---|---|
| `tui.windows` | dialog windows (with optional slash commands) |
| `tui.services` | data stores consumed by windows |
| `tui.commands` | slash commands with hints and argument completion |
| `tui.chrome.statusLine` | status bar lines |
| `tui.chrome.overlays` | full-screen overlays |
| `tui.chrome.widgets` | dialog item widget kinds |
| `tui.chrome.palette` | theme colors (dark/light/both) + runtime `color(key)` lookup |
| `tui.chrome.keys` | global key bindings with true preemption |
| `tui.chrome.inputStatus` | segments in the composer status line |
| `tui.hint.matchers` | command hint filter/rank overrides |
| `tui.hint.args` | literal argument-completion providers |
| `tui.tools` | tool call/result presentations, optional full takeover |
| `tui.content.nodes` | custom bubbles driven by session events |
| `tui.content.views` | custom bubble renderers |
| `tui.content.renderers` | takeover of builtin message-kind bodies |
| `tui.markdown.blocks` | block-level markdown renderers |
| `tui.markdown.inline` | inline (span) markdown renderers |
| `tui.markdown.languages` | code fence grammars (Prism) |
| `tui.composer.paste` | paste interception/transformation |
| `tui.composer.keys` | composer key interception |
| `tui.composer.insert` | programmatic insertion into the live composer |
| `tui.fields` + `tui.fields.factory` | special field kinds and instances (with pin) |
| `tui.hint` | command hint matching and argument providers |
| `tui.pointer` | pointer gesture handlers (observe or preempt builtins) |
| `tui.selection` | selection domains, text transformers, clipboard providers |
| `tui.clipboard` | clipboard read/write backends |
| `tui.interactions` | modal panels + programmatic push |
| `tui.startup` | boot progress sinks |
| `tui.chat` | send (text + image groups), sessions, event tap |

### Dispatch and override semantics (uniform across all faces)

- Every `register` returns a disposer; registrations unwind with the plugin's own fiber. Re-registering the same key layers an override on top, and disposal restores the layer beneath.
- Registries are order-based: `get(key)` resolves to the lowest-order live layer, and dispatch loops run `values()` in ascending order with first-claim-wins. Builtin behavior sits in high-order layers (windows/panels/services/widgets at 500+), so a plugin contribution with the default order (100) always wins regardless of registration timing.
- Handler chains: `chrome.keys` runs first and its `true` return truly consumes the event (composer, panels, dialog, and the shell all observe the arbiter). Pointer events route drag/up exclusively to the handler that claimed the press. Selection copy runs domain → transformers → clipboard providers. Clipboard reads fall through backend by backend until one answers.

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
- Typing a command exactly and pressing Enter runs it directly when the command has no `hint`; commands with arguments complete to `command ` on the first Enter (the hint UI) and run on the second.

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
- The builtin `approval` and `question` panels are themselves registered through this registry at high order, so a plugin contribution for the same `kind` overrides them and disposal restores the builtin.
- Panels that want the native pill look import the shared shell from `dsh-tui/dialog` instead of rebuilding it: `PanelSurface` (caps, background, per-row text or interactive content), `panelLegend` (key-hint rows with white keys and gray descriptions), and `panelAnchorRow` (the anchor row above the status line):

```ts
import { Dialog, PanelSurface, panelLegend, panelAnchorRow } from 'dsh-tui/dialog'

function ConfirmPanel({ request, resolve, active, columns, rows, innerWidth, blockWidth, background, onResize }) {
  const body = [
    { segments: renderPrompt(request) },
    { segments: panelLegend([{ key: 'enter', description: 'confirm' }, { key: 'esc', description: 'cancel' }]) },
  ]
  return (
    <PanelSurface
      columns={columns}
      rows={rows}
      body={body}
      bodyStart={panelAnchorRow(rows, body.length)}
      background={background}
      blockWidth={blockWidth}
    />
  )
}
```

- A row with a `content` node (e.g. buttons) renders that node instead of the segment text; text rows register as selectable chrome so panel text participates in selection and copy like builtin panels.

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

## Input, pointer, and selection

### tui.chrome.keys (true consumption)

Key bindings registered here run before every other key participant —
message-list scrolling, the composer, interaction panels, open dialogs, and
the shell. Returning `true` genuinely consumes the event:

```ts
tui.chrome.keys.register({
  id: 'quick-command',
  handle: (input, key) => {
    if (key.ctrl && input === 'k') { openLauncher(); return true }
    return false
  },
})
```

Ctrl+C with an active selection always copies, even when another participant
consumed the event.

### tui.pointer

Pointer handlers observe (or preempt) the builtin gesture chain: scrollbar,
hint drag, dialog, panel, input, and the message area live at order
100..190; a plugin's default order 300 sees presses the builtins did not
claim, and order < 100 preempts them.

```ts
tui.pointer.register({
  id: 'status-click',
  order: 150,
  onDown: ({ event, ui }) => {
    if (event.y !== ui.rows - 1 || ui.dialogOpen) return false
    openStatusMenu(event.x)
    return true // owns drag/up until release
  },
  onWheel: ({ event, session }) => {
    session.scroll(session.getSelection()?.anchorRow ?? 0) // example
    return true
  },
})
```

The frame carries the raw `MouseEventData` plus a session
(`getSelection`/`setSelection`/`scroll`/`autoScroll`) and a ui snapshot
(dialog/panel state, hint region, geometry, scroll).

### tui.selection

Selection copy is a three-stage pipeline: a domain claims the `LineSelection`
and extracts text, transformers rewrite it, and clipboard providers write it
(first `true` stops the chain). Builtin domains (message/chrome) and the
builtin clipboard provider (OSC52 + system fallback) sit at order 500.

```ts
tui.selection.domains.register({
  id: 'my-view',
  hit: sel => sel.inMessage === false && sel.anchorRow >= statusTop(),
  extract: (sel, ctx) => ctx.chromeText(sel),
})
tui.selection.transformers.register({
  id: 'strip-tables',
  transform: text => text.replace(/[│┃].*$/gm, ''),
})
tui.selection.clipboard.register({
  id: 'log-copy',
  copy: text => { myLog(text); return true },
})
```

### tui.clipboard

```ts
tui.clipboard.register({
  id: 'remote-clip',
  readText: () => myTransport.read(),
  writeText: text => myTransport.write(text), // return true to stop the chain
})
```

### tui.chrome.inputStatus

Render extra segments into the composer status line (between the builtin
mode/model/effort parts and the caret nonce):

```ts
tui.chrome.inputStatus.register({
  id: 'branch',
  render: ({ columns, rows, busy }) => busy ? null : { text: ` (${gitBranch()})`, color: '#8a8a8a' },
})
```

### tui.hint

```ts
tui.hint.matchers.register({
  id: 'fuzzy', // runs before the builtin prefix/subsequence/description tiers
  match: (entries, { query }) => fuzzyRank(entries, query),
})
tui.hint.args.register({
  id: 'envs',
  args: name => name === 'deploy' ? ['staging', 'production'] : null,
})
```

### tui.content.renderers

Take over the body rendering of any builtin message kind (including todo
bubbles, plan text, diff bodies, and assistant bubbles). Return `undefined`
to fall through to the builtin rendering; disposal restores it.

```ts
tui.content.renderers.register({
  kind: 'tool-diff',
  render: (message, width) => ({ lines: renderFancyDiff(message, width) }),
})
```

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
