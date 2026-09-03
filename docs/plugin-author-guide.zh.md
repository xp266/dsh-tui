English | [中文](plugin-author-guide.md)

# dsh-tui 扩展点

TUI 的每一个用户可见表面都是键控贡献注册表。插件通过标准 cordis bundle 机制
挂载，取得 `tui` 服务后注册贡献项；所有注册都支持运行时添加、分层覆盖与卸载还原。

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
- 每个 `register` 返回 disposer；注册随插件自身 fiber 退栈。同 key 重复注册会在上层压入覆盖层，卸载后自动还原下一层。
- markdown 与特殊字段的注册会额外失效渲染缓存并触发界面重渲染；窗口/工具/视图/色板注册走同一条重渲染通路。
- `tui.interactions` / `tui.chat` 在聊天桥就绪前为 `undefined`。

### 原生窗口（`dsh-tui/dialog`）

通过 `tui.windows` 注册的窗口渲染你给出的任意组件，但内置窗口构建在内部
Dialog 组件栈上。该栈以 `dsh-tui/dialog` 子路径导出，插件窗口可以做到与
原生完全一致——主题色、边框、标题、焦点导航、搜索、页脚、鼠标点击/滚轮、
关闭守卫全部免费获得：

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
        { items: [{ type: 'button', label: '执行', onPress: () => {} }] },
      ]}
      footer={[{ text: 'enter 确认 · esc 关闭', dim: true }]}
      onClose={onClose}
    />
  )
}
```

Dialog 条目（`static`/`button`/`select`/`input`/`checkbox`/`actions`/
`header`/`search`）覆盖绝大多数窗口形态；自定义条目类型经
`tui.chrome.widgets` 注册。

### 共享 react/ink 运行时（`dsh-tui/vendor`）

贡献给窗口、控件、覆盖层或面板的组件运行在 dsh-tui 的 React 树内，必须使用
dsh-tui 自己的 react 与 ink 实例。profile 的模块图只包含 dsh-tui 自己链接的
依赖；插件若自带 `react` 依赖会分叉 React 实例（fallback 副本的主版本不同），
hooks 直接崩溃。请从 vendor 入口导入，而不要把它们声明为依赖：

```ts
import { Box, Text, useInput, useStdout, React, useState, useEffect } from 'dsh-tui/vendor'
```

vendor 入口 re-export `lib/vendor.d.mts` 中列出的 react 与 ink API，是插件内
React 组件的唯一受支持来源。注意：以 `link:` 方式安装的插件（本地开发目录）
从 realpath 解析依赖，看不到 profile 的模块图——发布包请使用 `file:`、tarball
或 npm 安装（`dsh plugin add` 对发布包即是如此），静态导入才能解析。

## 贡献点总览

| 面 | 可贡献内容 |
|---|---|
| `tui.windows` | 对话框窗口（可带斜杠指令） |
| `tui.services` | 窗口消费的数据存储 |
| `tui.commands` | 斜杠指令，支持提示与参数补全 |
| `tui.chrome.statusLine` | 状态栏文本行 |
| `tui.chrome.overlays` | 全屏覆盖层 |
| `tui.chrome.widgets` | 对话框条目控件类型 |
| `tui.chrome.palette` | 主题色（深/浅/两者）+ 运行时 `color(key)` 查询 |
| `tui.chrome.keys` | 全局键位（真消费，先于一切按键参与者） |
| `tui.chrome.inputStatus` | 输入框状态行的附加分段 |
| `tui.hint.matchers` | 命令提示的过滤/排序覆盖 |
| `tui.hint.args` | 字面量参数补全提供器 |
| `tui.tools` | 工具调用/结果展示，可选完全接管 |
| `tui.content.nodes` | 由会话事件驱动的自定义气泡 |
| `tui.content.views` | 自定义气泡渲染器 |
| `tui.content.renderers` | 接管内置消息类型的主体渲染 |
| `tui.markdown.blocks` | 块级 markdown 渲染器 |
| `tui.markdown.inline` | 行内（span）markdown 渲染器 |
| `tui.markdown.languages` | 代码围栏语法（Prism） |
| `tui.composer.paste` | 粘贴拦截/改写 |
| `tui.composer.keys` | 输入框键位拦截 |
| `tui.composer.insert` | 向活动输入框编程式插入 |
| `tui.fields` + `tui.fields.factory` | 特殊字段类型与实例（支持 pin） |
| `tui.pointer` | 指针手势处理器（观察或抢占内置） |
| `tui.selection` | 选区 domain、文本变换链、剪贴板出口链 |
| `tui.clipboard` | 剪贴板读/写后端 |
| `tui.interactions` | 模态面板 + 主动弹出 |
| `tui.startup` | 启动进度接收器 |
| `tui.chat` | 发送（文本 + 图片组）、会话、事件监听 |

### 分发与覆盖语义（所有 face 统一）

- 每个 `register` 返回 disposer；注册随插件自身 fiber 退栈。同 key 重复注册在上层压入覆盖层，卸载后自动还原下一层。
- 注册表按 order 分层：`get(key)` 取 order 最低的存活层，分发循环按 `values()` 升序执行、先认领者胜。内置行为位于高 order 层（窗口/面板/服务/控件 500+），因此默认 order（100）的插件贡献无论注册时序如何必然生效。
- 处理器链：`chrome.keys` 最先运行且返回 `true` 即真实消费该按键（composer、面板、对话框、外壳都会观察仲裁标志）。指针事件的 drag/up 独占路由给认领按下事件的处理器。复制管线为 domain → 变换链 → 剪贴板出口链。剪贴板读取逐后端回退直到有结果。

## 窗口、控件与数据

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

- 组件 props：`{ open, onClose, handleRef? }`；渲染在对话框层（复用关闭守卫与鼠标选区）。
- `command` 生成同名斜杠指令；`required` 声明窗口依赖的窗口服务——服务就绪前不渲染。

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

- 按 DialogItem 的 `type` 注册 `WidgetDef`：`height`/`paintWidth`/`render` 必填；交互钩子（`stops`/`caret`/`onLeftRight`/`onEnter`/`onSpace`/`onClick`/`activate`/`searchTexts`/`fullRowFocus`/`selectable`/`editable`）可选。
- 通过 `DialogItemKinds` 模块扩充声明新条目类型，并入 `DialogItem` 联合。

### tui.services.register

```ts
tui.services.register('metrics', createMetricsStore())
```

- 窗口通过 `required: ['metrics']` 声明依赖，渲染侧用 `useWindowService('metrics')` 消费。

## 输入

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

- 不带 `run` 时，指令打开同 `id` 的窗口或覆盖层。
- `args` 提供字面量参数补全；`hint` 显示在输入提示里。
- 精确输入指令后按 Enter：无 `hint` 的指令直接执行；带参数的指令第一次 Enter 补全为 `command `（提示 UI），第二次 Enter 执行。

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

- 处理器按 `order` 先于内置粘贴分类执行（图片路径、长文本摘要）。
- 返回 `{ insert }` 即认领该次粘贴；插入文本仍会经过内置字段分类，因此直接返回路径或纯文本也能被自动 chip 化。
- 返回 `undefined` 则落到下一个处理器，最后走内置管线。

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

- 作用于输入框会消费的每一个按键，先于内置处理（输入、方向键、退格、发送）；仅在输入框处于交互态（无对话框/面板遮挡）时触发。
- 返回 `true` 消费按键；`false` 继续内置处理。

### tui.composer.insert

```ts
tui.composer.insert({ text: 'draft: ' })
tui.composer.insert({ field: { kind: 'ticket', label: '[T-42]', data: 42 } })
```

- 与用户输入等价地插入到光标处；输入框当前不可输入（对话框/面板打开）时返回 `false`。
- 字段插入与用户键入的 chip 行为一致：光标原子移动、整块删除、换行不拆分。

## 内容

### tui.tools.register

```ts
tui.tools.register({
  tool: 'deploy',
  call: ({ args, cwd }) => ({ label: `deploy[${String((args as { env?: string }).env)}]`, body: '' }),
  result: ({ result }) => ({ kind: 'replace', text: String((result.meta as { summary?: string }).summary ?? '') }),
})
```

- 按工具名键控；优先于 harness 工具自身展示，贡献返回 `undefined` 时回退。
- `call` 上下文：`{ tool, callId, args, argumentsRaw, cwd }`；`result` 增加 `result: { content, isError, meta? }`。
- 结果形态：`{ kind: 'replace' | 'append', text, label?, bodyCol?, exitCode?, signal?, diff?, read? }`；`diff` 渲染为内联 diff 块，`read` 渲染为带行号与语法高亮的读卡，均取代文本主体。`label` 在结算时替换卡片标题。
- 没有任何工具被豁免：`write`、`edit`、`read`、`bash`、`todo_write`、`ask_user_question`、`exit_plan_mode` 及所有其他内置视图均可在此覆盖。内置呈现器仅在该工具无注册贡献、或你的处理器返回 `undefined` 时执行。
- `takeover: true` 关闭回退：用于你想整体替换内置展示的工具，此时处理器返回 `undefined` 会渲染空卡片，而不再落到协议呈现。
- diff 行的背景色由 diff 数据本身决定（见下文），与工具名无关，因此插件贡献的 `diff` 也能获得与内置 `edit` 相同的红/绿底色。

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

- `match` 命中即认领事件（内置归约跳过）；`start` 产出一个自定义消息。
- 同一回合内的后续事件进入 `update`；返回 `null` 移除消息。`turn/end` 清空认领并结算 `running`/`streaming`。

### tui.content.views.register

```ts
tui.content.views.register({
  view: 'my-progress',
  render: ({ message }) => ({ label: 'Deploy', lines: [`phase: ${String((message.data as { phase?: string }).phase)}`], muted: false }),
})
```

- `render` 上下文：`{ message: CustomMessage, width }`；返回 `{ label?, lines, wrap?, muted? }`。
- `lines` 按宽度换行；`wrap: false` 原样保留。没有注册视图的消息渲染为 JSON。

## Markdown 扩展

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

- 按 marked token 的 `type` 键控（`code`、`heading`、`table`、`blockquote`、`list`、`html`……）。对既有 type 重复注册即覆盖该层，卸载后还原。
- `render` 收到原始 marked token 与 `{ palette, thinking, width, streamId }`，返回 `Segment[][]`（每行一组带样式分段）。行内容按 token 缓存——注册/卸载会自动清缓存。
- 也可以注册内置词法器不会产出的 type；如需新语法，请配合 marked 扩展自行注入。

### tui.markdown.inline.register

```ts
tui.markdown.inline.register({
  type: 'codespan',
  render: (token, { palette, base }) => ({ text: (token as { text: string }).text, style: base ?? palette.inlineCode }),
})
```

- 在内置 span 分派之前检查每个行内 token；返回的单个 `Segment` 接入周围文本流（换行与 run 合并照常生效）。

### tui.markdown.languages.register

```ts
import MyLang from 'prismjs/components/prism-my-lang'

tui.markdown.languages.register({ id: 'my-lang', grammar: MyLang, aliases: ['ml'] })
```

- 注册 Prism 语法，```` ```my-lang ```` 围栏立即高亮；`aliases` 可作为同义词。高亮缓存自动清除。

## 特殊字段

特殊字段是渲染在输入框与消息气泡内的行内 chip。一个字段占单个内部码点：
光标移动与删除按整块处理，换行永不拆分。字段自带样式（`color`、`background`、
可选 `bold`），渲染时解析，主题切换即时生效。

### tui.fields.register（字段类型）

```ts
tui.fields.register({
  kind: 'ticket',
  style: () => ({ color: '#101010', background: '#ffae00', bold: true }),
  expand: data => `[ticket ${String(data)}]`,
})
```

- `style()` 每次渲染重新读取（跟随主题）。
- `expand(data)` 把字段实例映射为发送消息中注入的文本；缺省发送 label。
- 内置：`image`（橙色 `[n images]`，发送真实图片附件）与 `paste`（橙色 `[n lines]` / `[n characters]`，发送完整原文）。二者由同一套机制构成。

### tui.fields.factory + tui.composer.insert（字段实例）

```ts
const char = tui.fields.factory.create({ kind: 'ticket', label: '[T-42]', data: 42, owner: 'composer' })
tui.composer.insert({ field: { kind: 'ticket', label: '[T-42]', data: 42 } })
```

- `create` 返回单字符哨兵（可自行拼入输入框文本），哨兵池耗尽返回 `null`（此时回退用 label 文本）。
- `composer.insert({ field })` 是便捷路径：分配并插入光标处一步完成。
- `owner` 决定回收：`'composer'` 的 chip 随文本离开输入框而释放，`'message'` 的 chip 存活于消息列表生命周期。
- 工厂另提供 `release(char)`、`isFieldChar(char)`、`labelOf(char)`。

## 外壳

### tui.chrome.statusLine.register

```ts
tui.chrome.statusLine.register({ id: 'clock', render: ({ columns }) => new Date().toLocaleTimeString() })
```

- 返回一行文本（允许 ANSI）；按 `order` 排在状态文本左侧之后。

### tui.chrome.overlays.register

```ts
tui.chrome.overlays.register({ id: 'banner', render: ({ onClose }) => <Banner onClose={onClose} /> })
```

- 覆盖层栈顶 id 等于注册 id 时渲染。

### tui.chrome.palette.register

```ts
tui.chrome.palette.register({ id: 'solarized', mode: 'dark', colors: { userBubbleBackground: '#073642' } })
```

- `mode`：`'dark' | 'light' | 'both'`（默认 both）；键为色板颜色名。
- 立即生效；卸载还原。支持 hmr 热替换。

### tui.chrome.keys.register

```ts
tui.chrome.keys.register({
  id: 'quick-save',
  handle: (input, key) => (key.ctrl && input === 's') ? (save(), true) : false,
})
```

- 按 `order` 先于内置外壳处理分发（含对话框打开时的忽略逻辑）；返回 `true` 消费按键。
- `TuiKey` 与 ink 的 `Key` 结构兼容；可以消费所有按键，包括 Ctrl+C。
- 文本输入框内部的按键请改用 `tui.composer.keys`。

## 面板、启动、聊天

### tui.interactions

```ts
tui.interactions.panels.register({
  kind: 'my-confirm',
  component: ({ request, resolve, reject, active, onResize }) => <ConfirmPanel request={request} />,
})

const answer = await tui.interactions.push('my-confirm', { prompt: 'ok?' }, signal)
```

- `panels.register` 按 `kind` 注册模态面板组件，props：`{ request, resolve, reject, active, columns, rows, innerWidth, blockWidth, background, handleRef?, onResize }`。
- `push(kind, request, signal?)` 弹出一次模态交互；promise 随面板的 `resolve`/`reject` 结算，`signal` 可中止。

### tui.startup.registerSink

```ts
tui.startup.registerSink({ id: 'my-startup-log', write: line => { process.stdout.write(`tui: ${line}\n`) } })
```

- 接收外壳逐行启动进度；注册时会重放已发出的行，启动结束后不再写入。多播。

### tui.chat

```ts
await tui.chat.send('hello')
tui.chat.send('see attachment', [[{ kind: 'path', path: '/tmp/diagram.png' }]])
tui.chat.send('clipboard shot', [[{ kind: 'data', data: bytes, mediaType: 'image/png', name: 'clipboard' }]])
await tui.chat.listSessions()
const off = tui.chat.onEvent(event => {})
```

- 方法：`send`/`interrupt`/`newSession`/`openSession`/`listSessions`/`onEvent`/`cwd`/`activeSessionId`。
- `send` 支持图片组：每个内层数组在消息中呈现为一个 `[n images]` chip；`path` 从磁盘读取，`data` 直接上传。模型收到真实图片块。

## 输入、指针与选区

### tui.chrome.keys（真消费）

此处注册的键位先于所有其他按键参与者——消息区滚动、输入框、交互面板、
打开的对话框与外壳。返回 `true` 即真实消费该事件：

```ts
tui.chrome.keys.register({
  id: 'quick-command',
  handle: (input, key) => {
    if (key.ctrl && input === 'k') { openLauncher(); return true }
    return false
  },
})
```

Ctrl+C 存在选区时始终复制，即使事件被其他参与者消费。

### tui.pointer

指针处理器观察（或抢占）内置手势链：滚动条、hint 拖拽、对话框、面板、
输入框与消息区位于 order 100..190；插件默认 order 300 观察未被认领的
按下事件，order < 100 则抢占。

```ts
tui.pointer.register({
  id: 'status-click',
  order: 150,
  onDown: ({ event, ui }) => {
    if (event.y !== ui.rows - 1 || ui.dialogOpen) return false
    openStatusMenu(event.x)
    return true // 独占 drag/up 直到释放
  },
})
```

帧携带原始 `MouseEventData`、会话（`getSelection`/`setSelection`/`scroll`/
`autoScroll`）与 UI 快照（对话框/面板状态、hint 区、几何、滚动）。

### tui.selection

复制是三段管线：domain 认领 `LineSelection` 并提取文本，transformer 改写，
clipboard provider 写出（首个 `true` 停止链路）。内置 domain（message/
chrome）与内置剪贴板出口（OSC52 + 系统回退）位于 order 500。

```ts
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
  writeText: text => myTransport.write(text), // 返回 true 停止链路
})
```

### tui.chrome.inputStatus

在输入框状态行渲染附加分段（位于内置 mode/model/effort 与光标 nonce 之间）：

```ts
tui.chrome.inputStatus.register({
  id: 'branch',
  render: ({ busy }) => busy ? null : { text: ` (${gitBranch()})`, color: '#8a8a8a' },
})
```

### tui.hint

```ts
tui.hint.matchers.register({
  id: 'fuzzy', // 先于内置 前缀/子序列/描述 三层匹配
  match: (entries, { query }) => fuzzyRank(entries, query),
})
tui.hint.args.register({
  id: 'envs',
  args: name => name === 'deploy' ? ['staging', 'production'] : null,
})
```

### tui.content.renderers

接管任意内置消息类型的主体渲染（包括 todo 气泡、plan 文本、diff 主体与
assistant 气泡）。返回 `undefined` 回落到内置渲染；卸载即还原。

```ts
tui.content.renderers.register({
  kind: 'tool-card',
  render: (message, width) => ({ lines: renderFancyDiff(message, width) }),
})
```

键是 `MessageKind`（`'bubble' | 'collapsible' | 'tool-card' |
'compaction' | 'custom'`）；diff 主体属于 `tool-card` 类型。

## 配置

```yaml
- id: tui
  name: dsh-tui
  config:
    theme: dark            # auto | dark | light
    colors:                # 色板键 -> 覆盖值，作用在 dark/light 两套主题之上
      modelText: '#e6e6e6'
      sectionHeader: '#ffae00'
    maxFps: 120
    bootListTimeout: 10000
    alternateScreen: true
```

第三方插件遵循 cordis 惯例：导出自己的 `Config` schema 与 `apply(ctx, config)`。
