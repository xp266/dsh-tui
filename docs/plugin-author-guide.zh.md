English | 中文

# dsh-tui 扩展点

## 挂载

包内声明 bundle 清单，一条命令装入 profile：

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

## 接入

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

- 导入任意 `dsh-tui/contract` 类型即获得 `ctx.tui` 的完整类型（纯类型入口，运行时为零模块，不会 fork 注册表）。
- 所有 `register` 返回 disposer，随插件 fiber 回收；同 key 重复注册分层覆盖，dispose 恢复上一层。
- `tui.interactions` / `tui.chat` 在 chat bridge 就绪前为 `undefined`。

## 贡献点

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

- 组件 props：`{ open, onClose, handleRef? }`，渲染在对话框层（复用关闭守卫与鼠标选择）。
- `command` 自动成为同名斜杠命令；`required` 列出依赖的 window services，未就绪不渲染。

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

- 无 `run` 时按 `id` 打开同名窗口或 overlay。
- `args` 为字面量参数补全，`hint` 显示在输入提示中。

### tui.tools.register

```ts
tui.tools.register({
  tool: 'deploy',
  call: ({ args, cwd }) => ({ label: `deploy[${String((args as { env?: string }).env)}]`, body: '' }),
  result: ({ result }) => ({ kind: 'replace', text: String((result.meta as { summary?: string }).summary ?? '') }),
})
```

- 按 `tool` 名 keyed；优先于 harness 工具自带呈现，返回 undefined 则回落。
- `call` 上下文：`{ tool, callId, args, argumentsRaw, cwd }`；`result` 上下文多 `result: { content, isError, meta? }`。
- result 形态：`{ kind: 'replace' | 'append', text, bodyCol?, exitCode?, signal?, diff? }`，`diff` 仅对 diff 类工具生效。
- `write`/`edit` 的 diff 视图与 `ask_user_question`/`todo`/计划模式为内建 chrome，不经此注册表。

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

- `match` 命中即接管该事件（内建归约跳过），`start` 产出一条 custom 消息。
- 同 turn 内后续事件走 `update`，返回 `null` 移除消息；`turn/end` 清空声明并收尾 `running`/`streaming`。

### tui.content.views.register

```ts
tui.content.views.register({
  view: 'my-progress',
  render: ({ message }) => ({ label: 'Deploy', lines: [`phase: ${String((message.data as { phase?: string }).phase)}`], muted: false }),
})
```

- `render` 上下文：`{ message: CustomMessage, width }`；返回 `{ label?, lines, wrap?, muted? }`。
- `lines` 按宽度折行，`wrap: false` 保留原样；未注册视图的消息以 JSON 兜底。

### tui.chrome.statusLine.register

```ts
tui.chrome.statusLine.register({ id: 'clock', render: ({ columns }) => new Date().toLocaleTimeString() })
```

- 返回单行文本（可含 ANSI），按 `order` 拼接在状态栏左侧状态文本之后。

### tui.chrome.overlays.register

```ts
tui.chrome.overlays.register({ id: 'banner', render: ({ onClose }) => <Banner onClose={onClose} /> })
```

- overlay 栈顶 id 与 `id` 相同时渲染。

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

- 按 DialogItem 的 `type` 注册 `WidgetDef`：`height`/`paintWidth`/`render` 必选，另有 `stops`/`caret`/`onEnter`/`onClick` 等交互钩子。
- 新条目类型先经 `DialogItemKinds` 声明合并加入 `DialogItem` 联合。

### tui.chrome.palette.register

```ts
tui.chrome.palette.register({ id: 'solarized', mode: 'dark', colors: { userBubbleBackground: '#073642' } })
```

- `mode`: `'dark' | 'light' | 'both'`（默认 both）；键为调色板键名。
- 注册即时生效，dispose 恢复，随 hmr 热替换。

### tui.chrome.keys.register

```ts
tui.chrome.keys.register({
  id: 'quick-save',
  handle: (input, key) => (key.ctrl && input === 's') ? (save(), true) : false,
})
```

- 在 shell 内建处理（含对话框打开时的忽略逻辑）之前按 `order` 分发，返回 `true` 消费该按键。
- `TuiKey` 与 ink `Key` 结构兼容；可消费一切按键，包括 Ctrl+C。

### tui.services.register

```ts
tui.services.register('metrics', createMetricsStore())
```

- 窗口通过 `required: ['metrics']` 声明依赖，渲染侧 `useWindowService('metrics')` 取用。

### tui.interactions

```ts
tui.interactions.panels.register({
  kind: 'my-confirm',
  component: ({ request, resolve, reject, active, onResize }) => <ConfirmPanel request={request} />,
})

const answer = await tui.interactions.push('my-confirm', { prompt: 'ok?' }, signal)
```

- `panels.register` 按 `kind` 注册模态面板组件，props：`{ request, resolve, reject, active, columns, rows, innerWidth, blockWidth, background, handleRef?, onResize }`。
- `push(kind, request, signal?)` 发起一次模态交互，Promise 随面板 `resolve`/`reject` 结算，`signal` 中止。

### tui.startup.registerSink

```ts
tui.startup.registerSink({ id: 'my-startup-log', write: line => { process.stdout.write(`tui: ${line}\n`) } })
```

- 接收 TUI 启动期逐行进度；注册时回放已发出的行，boot 结束后不再写入。多播。

### tui.chat

```ts
await tui.chat.send('hello')
await tui.chat.listSessions()
const off = tui.chat.onEvent(event => {})
```

- 方法：`send`/`interrupt`/`newSession`/`openSession`/`listSessions`/`onEvent`/`cwd`/`activeSessionId`。

## 配置

```yaml
- id: tui
  name: dsh-tui
  config:
    theme: dark            # auto | dark | light
    maxFps: 120
    bootListTimeout: 10000
    alternateScreen: true
```

第三方插件按 cordis 惯例导出自己的 `Config` schema 与 `apply(ctx, config)`。
