[English](environment.md) | 中文

# 环境变量

`dshtui` 启动时会自动探测终端，因此这些变量都非必需，只用于覆盖探测结果错误的情况。

## 显示

| 变量 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `DSH_TUI_COLOR` | `0` 无色、`1` ansi16、`2` ansi256、`3` truecolor，也接受 `none`/`false` 与 `truecolor` | 探测 | 为整个会话强制色阶，启动探测无法再抬高它。 |
| `DSH_TUI_ASCII` | `1` | 关 | 全部字形降级为 ASCII，不再使用制表符等 Unicode 字符。 |
| `DSH_TUI_WIDTH` | `wcwidth`、`unicode` | `unicode` | 字符宽度模型。`wcwidth` 使用传统东亚宽度表（emoji 按 1 格计），`unicode` 按字素簇计算。若终端把 emoji 渲染为 1 格，请设为 `wcwidth`，否则列会累积偏移，选取文本时出现多余空格。 |
| `DSH_TUI_BG` | `dark`、`light` | 探测 | 强制主题的深/浅背景模式，而非自动探测。 |

## 主题

| 变量 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `DSH_TUI_HOT_THEME` | `1` | 关 | 监听主题源文件，每次保存即重新应用颜色。 |
| `DSH_TUI_THEME_PATH` | 路径 | `src/theme.ts`（包内副本） | `DSH_TUI_HOT_THEME` 重载的主题文件；相对路径基于当前工作目录解析。 |

## 诊断

| 变量 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `DSH_TUI_DEBUG` | `1` | 关 | 把警告和错误镜像到 stderr。 |
| `DSH_TUI_LOG_FILE` | `0` 关闭 | 开 | 将诊断日志写入 `<DSH_HOME>/logs/dshtui.log`。 |

## 宿主

| 变量 | 取值 | 默认 | 作用 |
|---|---|---|---|
| `DSH_HOME` | 路径 | `~/.dsh` | 属于 DeepSeek Harness 而非本插件：它决定 harness 的 profile、会话与日志目录。`dshtui` 读取同一变量，使其会话列表、语言存储与日志文件都落在该目录内。仅当你本来就用非默认 home 运行 `dsh` 时才需设置。 |

无论 `DSH_TUI_DEBUG` 与 `DSH_TUI_LOG_FILE` 取值如何，启动失败时启动器仍会把一次性报告打到 stderr：这两个变量控制的是常驻日志，不是那份报告。
