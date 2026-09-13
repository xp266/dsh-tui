# dshtui

[English](README.md) | 中文

<p align="center">
  <img src="docs/main_logo.jpg" alt="dshtui" width="720">
</p>

`dshtui` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的终端界面插件，基于 [Ink](https://github.com/vadimdemedes/ink) 渲染，opencode的tui风格。它以 bundle 插件形式挂载进 dsh profile，接管整个终端界面：流式对话、可折叠的工具卡片、各类对话框，以及覆盖全部可见表面的插件贡献 API。

本项目作为 deepseek harness 的插件存在。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- `dsh` CLI：`npm install -g @deepseek-ai/dsh`

## 安装

```sh
npm install -g @xp266/dshtui@latest
dshtui
```

`dshtui` 会先确定要启动的 profile（优先 `dshtui`，否则使用已挂载本包的既有 profile），在其中安装或升级本插件，然后以 `dsh --profile <name>` 启动。

也可以不用启动器，手动装入任意 profile：

```sh
dsh plugin --profile <name> add @xp266/dshtui@latest
dsh --profile <name>
```

## 插件开发

界面的每一个可见表面都是 `tui` 服务背后的键控贡献注册表。完整的贡献点清单见[扩展点指南](docs/plugin-author-guide.zh.md)。

## 从源码运行或开发

```sh
git clone https://github.com/xp266/dsh-tui.git
cd dsh-tui
pnpm install
pnpm build
npm install -g .
dshtui
```

## 许可证

[MIT](LICENSE)
