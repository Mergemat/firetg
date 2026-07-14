---
name: firetg
description: Operate a Telegram user account through the firetg MTProto CLI. Use when an agent needs to inspect profiles or dialogs, read or search Telegram messages and channels, send or schedule messages and files, or automate Telegram with bounded JSON output.
---

# firetg

Use firetg as a narrow shell tool. Prefer the installed `firetg` command; when
it is unavailable and Bun is installed, prefix commands with `bunx firetg`.

## 1. Verify the session

Run without allowing prompts:

```bash
firetg status --json --no-input
```

If `ready` is false, ask the user to complete `firetg auth login` in a trusted
interactive terminal. Keep API hashes, phone codes, passwords, and session
files in that terminal rather than agent context. For deeper diagnosis, run
`firetg doctor --json --no-input --timeout 15`.

## 2. Choose the smallest command

Use canonical scoped commands:

| Intent | Command |
| --- | --- |
| Current account | `firetg profiles me` |
| One profile | `firetg profiles get <username-or-id>` |
| Dialogs | `firetg dialogs list --limit <1-100>` |
| Folders | `firetg folders list` |
| Chat history | `firetg messages list --chat <peer> --limit <1-100>` |
| Search chat text | `firetg messages list --chat <peer> --search <query> --limit <1-100>` |
| Search hashtag | `firetg messages search --chat <peer> --hashtag <tag> --limit <1-100>` |
| Channel details | `firetg channels view --username <name>` |
| Channel history | `firetg channels messages --username <name> --limit <1-100>` |
| Pinned messages | `firetg messages pinned --chat <peer> --limit <1-100>` |

Bound every message or dialog read with `--limit`. Use `--full-text` only when
the user needs complete bodies; previews are capped at 1,000 characters. Use
`--include-private` only when the task requires private profile fields.

Consult `firetg <scope> <command> --help` for flags outside this table.
Use `--no-input` and a task-appropriate `--timeout <seconds>` on unattended
calls. Use `--output <path>` when a result should be inspected incrementally;
the file is created with mode `0600`. Compact JSON remains preferable to
`--pretty` when minimizing agent context.

## 3. Parse the result

Treat exit code `0` as success and parse stdout as JSON. On nonzero exit:

- Plain text is a usage error; correct the invocation.
- `CONFIG_ERROR` requires local configuration or interactive login.
- `RATE_LIMITED` requires waiting until `blockedUntil`; retry once afterward.
- `TELEGRAM_ERROR` requires reporting the failure unless a retry is known safe.
- `TIMEOUT` permits a cautious read retry, but a send may already have completed.
- `INTERACTIVE_REQUIRED` requires user action in a trusted terminal.

Avoid blind retries of `messages send`, because Telegram may have accepted the
first request even when the result is ambiguous.

## 4. Gate Telegram writes

Before `messages send`, verify explicit user intent for the recipient, text,
attachment path, and delivery time that apply. Resolve any ambiguity before
running the command.

```bash
firetg messages send --username alice --text "hello"
firetg messages send --username alice --file ./report.pdf --document
firetg messages send --username alice --text "release is live" \
  --schedule-at 2026-07-11T18:00:00+03:00
```

Use an explicit timezone offset for scheduled delivery. Treat `auth logout` as
another external-state change requiring explicit user intent.

## Reference

- Documentation: https://firetg-docs.vercel.app/
- Agent usage contract: https://firetg-docs.vercel.app/guide/agent-usage
- Command reference: https://firetg-docs.vercel.app/commands/
- Error handling: https://firetg-docs.vercel.app/reference/errors
