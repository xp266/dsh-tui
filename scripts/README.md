# dsh-tui snapshot

Headless text-snapshot tool for the dsh-tui ink UI. Renders the real `App`
component into a virtual terminal and dumps the on-screen layout as plain
text or truecolor ANSI, without starting a real terminal session.

## Usage

```sh
scripts/snapshot <command> [options]
```

| Command | Description |
|---|---|
| `list [--json]` | List every available scenario id |
| `shot <id>` | Render one scenario and print the full-screen snapshot |
| `shot-all` | Render every scenario to files |
| `help` | Show usage |

Scenarios are discovered from project sources at build time: every entry in
`src/ui/input/commands.ts COMMANDS` becomes a `command/<id>` scenario and
every `push*` method of `InteractionStore` becomes a `panel/<name>` scenario,
so new commands and panels appear automatically. Built-in scenarios:
`base`, `input`, `hint`, `chat-transcript`.

## Options

| Option | Default | Description |
|---|---|---|
| `--cols N` / `--rows N` | 100 / 32 | Virtual terminal size |
| `--text STR` | sample | Composer text for the `input` scenario |
| `--permission MODE` | workspace-write | Permission mode (affects chrome color) |
| `--model NAME` / `--preset ID` / `--effort ID` / `--cwd PATH` | built-in mock | Status line values |
| `--settle MS` | 250 | Quiet period before taking a snapshot |
| `--max-wait MS` | 1500 | Hard timeout waiting for a stable frame |
| `--out PREFIX` | none | Write `<PREFIX>.txt` (plain) and `<PREFIX>.ans` (truecolor) |
| `--outdir DIR` | `/tmp/dsh-tui-snapshot/shots` | Output directory for `shot-all` |
| `--print MODE` | plain | stdout output for `shot`: `plain`, `ansi` or `none` |

## Examples

```sh
scripts/snapshot list
scripts/snapshot shot base
scripts/snapshot shot command/models --print ansi > /tmp/models.ans
scripts/snapshot shot panel/pushQuestion --out /tmp/dsh-tui-snapshot/question
scripts/snapshot shot-all
```

`.txt` files contain the exact character grid of the screen; `.ans` files add
24-bit color escape sequences. View them with `cat`.

The launcher rebuilds the bundle from current sources before every run, so
snapshots always reflect the latest code.
