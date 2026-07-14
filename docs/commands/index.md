---
description: Browse every firetg command group, global behavior, and compatibility alias.
---

# Command reference

firetg groups commands by Telegram capability. Run any group without a subcommand to see its local help.

```sh
firetg --help
firetg messages
firetg messages send --help
```

## Command map

| Group | Commands | Purpose |
| --- | --- | --- |
| [Diagnostics](/commands/diagnostics.md) | `status`, `doctor` | Inspect readiness and verify Telegram connectivity |
| [`auth`](/commands/auth.md) | `login`, `logout` | Create and remove the local Telegram session |
| [`profiles`](/commands/profiles.md) | `me`, `get` | Read account and user profiles |
| [`channels`](/commands/channels.md) | `view`, `messages`, `pinned` | Inspect broadcast channels |
| [`messages`](/commands/messages.md) | `send`, `list`, `search`, `pinned` | Send and read message streams |
| [`dialogs`](/commands/dialogs-folders.md#dialogs-list) | `list` | List chats, optionally by folder |
| [`folders`](/commands/dialogs-folders.md#folders-list) | `list` | Discover dialog filters and archive scope |

## Global behavior

- All successful command results are JSON written to stdout.
- Structured failures are also JSON written to stdout.
- Prompts and output-file confirmations are written to stderr.
- `--help` is available at the root, group, and command level.
- `--json` explicitly requests the default JSON contract.
- `--pretty` formats JSON with indentation.
- `--output <path>` writes output to a mode-`0600` file and leaves stdout empty.
- `--no-input` rejects commands that require prompts.
- `--timeout <seconds>` bounds command execution and accepts positive decimals.
- Positive integer options reject zero, negative values, and non-integers.

## Legacy aliases

Canonical scoped commands are recommended. These compatibility aliases are also accepted:

| Alias | Canonical command |
| --- | --- |
| `firetg me` | `firetg profiles me` |
| `firetg send ...` | `firetg messages send ...` |
| `firetg messages:list ...` | `firetg messages list ...` |
| `firetg messages:search ...` | `firetg messages search ...` |
| `firetg messages:pinned ...` | `firetg messages pinned ...` |
| `firetg dialogs:list ...` | `firetg dialogs list ...` |
| `firetg folders:list` | `firetg folders list` |
