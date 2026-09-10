# 参与贡献

[English](CONTRIBUTING.md) | 中文

感谢你对 dshtui 的关注。本项目是 DeepSeek Harness 的终端界面插件，欢迎提交
issue、功能建议与 pull request。

## 开始之前

- 先读 [AGENTS.md](AGENTS.md)：其中记录了本仓库强制执行的代码风格，以及维持
  插件与其宿主兼容的约束。
- 较大的改动请先开 issue 讨论方案，再动手写代码。

## 开发环境

需要 Node.js `^22.19.0 || >=24.0.0` 与 pnpm。

```sh
git clone https://github.com/xp266/dsh-tui.git
cd dsh-tui
pnpm install
```

## 检查

提交 pull request 前，请运行与 CI 相同的门禁：

```sh
pnpm typecheck
pnpm build
pnpm verify
```

- `typecheck` — `tsc --noEmit`。
- `build` — 用 tsdown 将 `src/` 打包到 `lib/`。
- `verify` — 上游兼容性契约、可选 peer 声明、构建产物目标检查。

## 提交与分支

- 约定式提交：`type(scope): summary`，`type` 为
  `feat`/`fix`/`docs`/`chore`/`refactor`/`test` 之一。
- 英文、祈使语气、小写开头、结尾不加句号。
- 不使用 emoji，不添加 AI 署名脚注。
- 分支：`type/topic`，topic 用连字符分隔，最多三个单词。

## Pull request

- 保持 diff 聚焦；无关改动请拆到单独的 PR。
- 描述行为变化以及你的验证方式。本仓库没有单元测试：verify 门禁加上针对
  dsh profile 的实际运行就是检查手段。
- 行为变化时，同步更新两种语言的文档（`README.md`/`README.zh.md` 与
  `docs/plugin-author-guide.md`/`docs/plugin-author-guide.zh.md`）；两份文档
  保持结构一致。

## 许可证

参与贡献即表示你同意以 [MIT 许可证](LICENSE) 授权你的贡献。
