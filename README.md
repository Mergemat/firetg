# firetg

Telegram MTProto CLI for scripts and agents.

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
The Telegram session is stored in `~/.config/firetg/session`.

## Commands

```bash
firetg profiles me
firetg profiles view --username telegram
firetg profiles view --id 116040563

firetg channels view --username telegram
firetg channels view --id 100
firetg channels messages --username example_channel --limit 50
firetg channels pinned --username example_channel --limit 20

firetg messages send --username telegram --text "hello"
firetg messages send --id 116040563 --text "hello"
firetg messages send --username telegram --file ./photo.jpg --text "caption"
firetg messages send --username telegram --file ./report.pdf --document
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

Commands print JSON to stdout.
Prompts and diagnostics print to stderr.

Success:

```json
{"ok":true,"data":{}}
```

Error:

```json
{"ok":false,"error":{"code":"CONFIG_ERROR","message":"Missing config file at /path/to/config.json"}}
```
