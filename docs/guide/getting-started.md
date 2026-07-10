---
description: Install firetg, authenticate a Telegram account, and run the first read and send commands.
---

# Getting started

Get from a fresh machine to your first Telegram result in a few minutes.

## Requirements

- [Bun](https://bun.sh/) installed locally
- A Telegram account
- A Telegram API ID and API hash from [my.telegram.org/apps](https://my.telegram.org/apps)

::: info
firetg connects as your Telegram account through MTProto. It is not a Bot API client and does not require a bot token.
:::

## 1. Run firetg

Use the package without installing it:

```sh
bunx firetg --help
```

Or install it globally:

```sh
bun install -g firetg
firetg --help
```

## 2. Log in

Create a Telegram app at [my.telegram.org/apps](https://my.telegram.org/apps), then start the default QR flow:

```sh
firetg auth login
```

On the first login, firetg asks for the API ID and API hash. Scan the displayed QR code in Telegram. If your account uses two-step verification, enter the password when prompted.

Prefer a phone code instead:

```sh
firetg auth login --phone
```

See [Authentication](/guide/authentication.md) for storage paths, permissions, and session migration.

## 3. Verify the session

```sh
firetg profiles me
```

Successful commands print the command result directly as JSON:

```json
{
  "id": "123456789",
  "username": "firetg",
  "firstName": "Fire",
  "lastName": "TG"
}
```

## 4. Read and send

Read your Saved Messages:

```sh
firetg messages list --chat me --limit 20
```

Send a message by username:

```sh
firetg messages send --username alice --text "hello"
```

Search one chat:

```sh
firetg messages list --chat launch-team --search deploy --limit 10
```

## 5. Compose with other tools

Because stdout contains JSON only, normal shell pipelines work without cleanup:

```sh
firetg dialogs list --limit 50 | jq '.[] | select(.unreadCount > 0)'
```

Keep stderr visible during interactive login. Prompts and QR output are intentionally written there.

## Where next

- Learn the accepted [peer formats](/guide/peers.md).
- Set safe conventions for [agent usage](/guide/agent-usage.md).
- Browse the complete [command reference](/commands/).
- Understand [JSON output](/reference/output.md) and [errors](/reference/errors.md).
