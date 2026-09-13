# dshtui

English | [中文](README.zh.md)

<p align="center">
  <img src="docs/main_logo.jpg" alt="dshtui" width="720">
</p>

`dshtui` is a terminal UI plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), built on [Ink](https://github.com/vadimdemedes/ink), in the TUI style of opencode. It mounts into a dsh profile as a bundle plugin and takes over the whole terminal interface: streaming chat, foldable tool cards, dialogs, and a plugin contribution API covering every visible surface.

This project exists as a plugin of DeepSeek Harness.

## Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- The `dsh` CLI: `npm install -g @deepseek-ai/dsh`

## Install

```sh
npm install -g @xp266/dshtui@latest
dshtui
```

`dshtui` first resolves the profile to boot (the `dshtui` profile, or an existing profile that already mounts this package), installs or upgrades the plugin inside it, then launches `dsh --profile <name>`.

The launcher is optional; install the plugin into any profile by hand:

```sh
dsh plugin --profile <name> add @xp266/dshtui@latest
dsh --profile <name>
```

## Plugin development

Every visible surface of the interface is a keyed contribution registry behind the `tui` service. The full contribution map lives in the [extension point guide](docs/plugin-author-guide.md).

## Run or develop from source

```sh
git clone https://github.com/xp266/dsh-tui.git
cd dsh-tui
pnpm install
pnpm build
npm install -g .
dshtui
```

## License

[MIT](LICENSE)
