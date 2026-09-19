---
description: Send text or files, schedule delivery, read history, search streams, and list pinned messages.
---

# messages

Send text or files, read history, search scoped streams, and list pinned messages.

## `messages send`

```text
firetg messages send (--username <username> | --id <user-id>) \
  (--text <message> | --file <path>) \
  [--document] [--schedule-at <when>]
```

Exactly one destination is required. Supply text, a file, or both when the text is an attachment caption.

| Option | Description |
| --- | --- |
| `--username <username>` | Destination username, with or without `@` |
| `--id <user-id>` | Known destination user ID |
| `--text <message>` | Message text or attachment caption |
| `--file <path>` | Local image, video, audio, or document |
| `--attachment <path>` | Alias for `--file` |
| `--document` | Force the file to be sent as a document |
| `--force-document` | Alias for `--document` |
| `--schedule-at <when>` | Future ISO-8601 date-time or Unix seconds |

```sh
firetg messages send --username alice --text "hello"
firetg messages send --id 123456789 --text "hello"
firetg messages send --username alice --file ./photo.jpg --text "caption"
firetg messages send --username alice --file ./report.pdf --document
```

Schedule Telegram-native delivery with an explicit timezone:

```sh
firetg messages send \
  --username alice \
  --text "release is live" \
  --schedule-at 2026-07-11T18:00:00+03:00
```

Relative file paths are resolved from the current working directory. firetg checks that an attachment exists and is a regular file before connecting to Telegram.

Success returns only the new message ID, date, and optional media summary. The
submitted text/caption is not echoed back into agent context.

::: warning External side effect
This command can notify another person. Confirm the recipient and content before an agent or script runs it.
:::

The legacy alias is `firetg send`.

## `messages list`

```text
firetg messages list (--chat <peer> | --chats <peer[,peer...]>) [--limit <n>] [--search <query>]
```

Reads recent history newest first. `--chat` accepts a username, peer ID, or self alias.

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--chat <peer>` | One of `--chat` / `--chats` | | Single chat or peer |
| `--chats <peer[,peer...]>` | One of `--chat` / `--chats` | | Batch of comma-separated peers |
| `--limit <n>` | No | `20` | Maximum messages to return per chat |
| `--search <query>` | No | | Search within the chat history |
| `--full-text` | No | Off | Return complete text instead of 1,000-character previews |

```sh
firetg messages list --chat me --limit 20
firetg messages list --chat launch-team --search deploy --limit 10
```

The legacy alias is `firetg messages:list`.

`--limit` must be between 1 and 100. Preview results include
`textTruncated: true` when shortened.

### Batch history

Read the last 20 messages from each selected dialog in one command:

```sh
firetg messages list --chats alice,bob,me --limit 20
```

The batch uses one Telegram connection and reads chats sequentially. Results
follow input order, with whitespace trimmed and exact duplicate peers removed.
Empty peers are rejected. `--search` and `--full-text` apply to every chat.

Each entry contains either `messages` or `error`:

```json
[
  {"chat": "alice", "messages": []},
  {"chat": "bob", "error": {"code": "TELEGRAM_ERROR", "message": "Telegram username was not found. Check the username and retry"}},
  {"chat": "me", "messages": []}
]
```

An empty `messages` array is a successful read. Inaccessible chats do not
discard successful results or stop later reads. A rate limit stops further
requests and attaches the same `RATE_LIMITED` error, including `blockedUntil`
and `remainingSeconds`, to the remaining chats.

Exit code `0` means every chat succeeded; `2` indicates a Telegram or rate-limit
failure. Local input or configuration errors exit `1`. Failures before reading
the batch use the normal error envelope. Keep successful entries when handling
a partial failure and retry only failed chats when appropriate.

## `messages search`

```text
firetg messages search --chat <peer> \
  (--hashtag <tag> | --reply-to <id> --from <peer[,peer...]>) \
  [--limit <n>]
```

This command has two mutually exclusive modes.

All modes accept `--full-text`; without it, message text is limited to a
1,000-character preview. `--limit` must be between 1 and 100.

### Search by hashtag

```sh
firetg messages search --chat launch-team --hashtag "#deploy" --limit 100
```

The `#` prefix is optional. The default limit is `100`.

### Search replies by sender

```sh
firetg messages search \
  --chat launch-team \
  --reply-to 101 \
  --from 42,alice \
  --limit 50
```

`--from` accepts one or more comma-separated usernames or IDs. The default limit is `50`.

The legacy alias is `firetg messages:search`.

## `messages pinned`

```text
firetg messages pinned --chat <peer> [--limit <n>]
```

Reads pinned messages from a chat or channel, newest first. The default limit is `20`.
Pass `--full-text` only when complete pinned-message bodies are required.

```sh
firetg messages pinned --chat telegram --limit 20
```

The legacy alias is `firetg messages:pinned`.
