# firetg

Telegram MTProto CLI for scripts and agents, powered by
[mtcute](https://mtcute.dev/).

## Install

Run directly:

```bash
bunx firetg --help
```

Or install globally:

```bash
bun install -g firetg
firetg --help
```

## Login

Create a Telegram app at https://my.telegram.org/apps, then run:

```bash
firetg auth login
```

The CLI asks for your API ID and API hash, then shows a QR code to scan in Telegram.

Phone login is also supported:

```bash
firetg auth login --phone
```

Credentials are stored in `~/.config/firetg/config.json`.
Telegram auth state and the peer cache are stored in
`~/.config/firetg/telegram.sqlite`.

Existing Teleproto/GramJS string sessions at `~/.config/firetg/session` are
converted to mtcute storage on the first authenticated command. The legacy
session and `peers.json` files are removed after a successful conversion.

Set `XDG_CONFIG_HOME` to place the `firetg` directory elsewhere. If it is not
set, firetg uses the current user's standard `~/.config` directory.

## Commands

```bash
firetg profiles me
firetg profiles get telegram
firetg profiles get 116040563

firetg channels view --username telegram
firetg channels view --id 100
firetg channels messages --username example_channel --limit 50
firetg channels pinned --username example_channel --limit 20

firetg messages send --username telegram --text "hello"
firetg messages send --id 116040563 --text "hello"
firetg messages send --username telegram --file ./photo.jpg --text "caption"
firetg messages send --username telegram --file ./report.pdf --document
firetg messages send --username telegram --text "hello later" --schedule-at 2026-07-05T15:00
firetg messages list --chat me --limit 20
firetg messages list --chat me --search deploy --limit 10
firetg messages search --chat launch-team --hashtag "#deploy" --limit 100
firetg messages search --chat launch-team --reply-to 101 --from 42,alice --limit 50

firetg folders list
firetg dialogs list --folder 1 --limit 20

firetg auth logout
```

Use `--help` for more detail:

```bash
firetg --help
firetg messages --help
firetg channels view --help
firetg channels messages --help
firetg channels pinned --help
firetg messages list --help
firetg messages search --help
```

## Output

Successful commands print JSON to stdout. Telegram, configuration, and
rate-limit failures retain structured JSON when agents need to branch or
schedule a retry. Command/argument mistakes print concise text plus relevant
usage so an agent does not need a second `--help` call.
Prompts and diagnostics print to stderr.

Success output is the command result itself:

```json
{}
```

Error:

```json
{"ok":false,"error":{"code":"CONFIG_ERROR","message":"Missing config file at /path/to/config.json"}}
```

Usage error:

```text
Unknown command: dialogs listdd.

Available dialogs commands:
  firetg dialogs list [--folder <id>] [--limit <n>]
```

Message-reading commands return at most 100 items. Text is limited to a
1,000-character preview by default and includes `"textTruncated":true` when
shortened. Pass `--full-text` only when complete bodies are needed.
