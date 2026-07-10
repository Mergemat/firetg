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
firetg messages list --chat <peer> [--limit <n>] [--search <query>]
```

Reads recent history newest first. `--chat` accepts a username, peer ID, or self alias.

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--chat <peer>` | Yes | | Chat or peer |
| `--limit <n>` | No | `20` | Maximum messages to return |
| `--search <query>` | No | | Search within the chat history |
| `--full-text` | No | Off | Return complete text instead of 1,000-character previews |

```sh
firetg messages list --chat me --limit 20
firetg messages list --chat launch-team --search deploy --limit 10
```

The legacy alias is `firetg messages:list`.

`--limit` must be between 1 and 100. Preview results include
`textTruncated: true` when shortened.

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
