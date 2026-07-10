---
description: Inspect Telegram broadcast-channel metadata, message history, and pinned messages.
---

# channels

Inspect broadcast-channel metadata, history, and pinned messages.

All channel commands require exactly one of `--username` or `--id`.

## `channels view`

```text
firetg channels view (--username <username> | --id <channel-id>)
```

```sh
firetg channels view --username telegram
firetg channels view --username @telegram
firetg channels view --id 100
```

The result includes channel metadata and, when Telegram provides it, the description and current pinned message.

```json
{
  "id": "-100100",
  "title": "Telegram",
  "username": "telegram",
  "description": "Official Telegram channel",
  "participantsCount": 1000000,
  "verified": true
}
```

Optional flags can include `restricted`, `scam`, and `fake`. See [JSON output](/reference/output.md#channel-details) for the full shape.

## `channels messages`

```text
firetg channels messages (--username <username> | --id <channel-id>) [--limit <n>]
```

Reads channel history newest first.

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--username <username>` | One destination required | | Channel username |
| `--id <channel-id>` | One destination required | | Known channel ID |
| `--limit <n>` | No | `20` | Maximum messages to return |

```sh
firetg channels messages --username telegram --limit 50
```

The result is an array of [message summaries](/reference/output.md#message-summary).

## `channels pinned`

```text
firetg channels pinned (--username <username> | --id <channel-id>) [--limit <n>]
```

Reads pinned channel messages newest first. The default limit is `20`.

```sh
firetg channels pinned --username telegram --limit 20
```

Use `channels view` when you need channel metadata and its current pinned message. Use `channels pinned` when you need the pinned-message stream.
