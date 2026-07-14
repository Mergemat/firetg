---
description: Parse firetg success values, error envelopes, and every JSON result type.
---

# Output

firetg writes successful results as one JSON value on stdout. It does not wrap successful results in an `ok` or `data` envelope.

## Success

A command that returns an object writes that object directly:

```json
{"id":"42","firstName":"Fire","username":"firetg"}
```

A list command writes an array directly:

```json
[{"id":84,"date":1783785600,"text":"hello"}]
```

Output is compact, one-line JSON. Examples in these docs are formatted across multiple lines for readability.

Pass `--pretty` to indent JSON for human inspection. Pass `--output <path>` to
write the same compact or pretty output to a file instead of stdout. firetg
creates parent directories, sets the file mode to `0600`, and writes the
absolute destination confirmation to stderr. Check the process exit code even
when output is written to a file: operational failures are written there too.

```sh
firetg dialogs list --limit 50 --output /tmp/dialogs.json
firetg status --pretty
```

## Operational failure

Configuration, Telegram, and rate-limit failures use a stable envelope:

```json
{
  "ok": false,
  "error": {
    "code": "CONFIG_ERROR",
    "message": "Missing Telegram login at /Users/you/.config/firetg/telegram.sqlite; run firetg auth login"
  }
}
```

Read [Errors and exit codes](/reference/errors.md) for retry guidance.

## Usage failure

Unknown commands and invalid arguments use concise text followed by the
smallest relevant help. This is intentionally not wrapped in JSON: the exit
code already identifies failure, and the usage line prevents a follow-up help
call.

```text
messages list requires --chat.
Usage: firetg messages list --chat <peer> [--limit <n>] [--search <query>]
```

## Account

Returned by `profiles me`.

```ts
type Account = {
  id: string;
  firstName: string;
  username?: string;
  lastName?: string;
  phone?: string;
};
```

CLI profile commands omit `phone` unless `--include-private` is supplied.

## Profile

Returned by `profiles get`.

```ts
type Profile = Account & {
  about?: string;
  bot?: boolean;
  verified?: boolean;
  premium?: boolean;
  restricted?: boolean;
  scam?: boolean;
  fake?: boolean;
};
```

## Sent message

Returned by `messages send`.

```ts
type SentMessage = {
  id: number;
  date: number;
  media?: MessageMediaSummary;
};
```

`date` is a Unix timestamp in seconds.

## Message summary

Returned by message and channel history commands.

```ts
type MessageSummary = {
  id: number;
  date: number;
  text: string;
  textTruncated?: boolean;
  media?: MessageMediaSummary;
  senderId: string;
  chatId: string;
  replyToMessageId?: number;
  outgoing: boolean;
  readReceipt?: {
    read: boolean;
    direction: "inbox" | "outbox";
  };
};
```

Message-reading commands return a maximum of 100 items. `text` is a
1,000-character preview by default; `textTruncated` is present only when text
was shortened. Pass `--full-text` when the complete body is required.

Messages are returned newest first. `readReceipt` is included only when Telegram exposes the dialog read state.

## Media summary

Media is summarized rather than downloaded.

```ts
type MessageMediaSummary = {
  type: string;
  fileName?: string;
  mimeType?: string;
  size?: string;
  title?: string;
  url?: string;
  phoneNumber?: string;
};
```

The available optional fields depend on the Telegram media type.

## Channel details

Returned by `channels view`.

```ts
type ChannelDetails = {
  id: string;
  title: string;
  username?: string;
  description?: string;
  participantsCount?: number;
  pinnedMessage?: MessageSummary;
  verified?: boolean;
  restricted?: boolean;
  scam?: boolean;
  fake?: boolean;
};
```

## Dialog summary

Returned by `dialogs list`.

```ts
type DialogSummary = {
  id: string;
  title: string;
  folderId?: number;
  unreadCount: number;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
};
```

## Folder summary

Returned by `folders list`.

```ts
type FolderSummary = {
  id?: number;
  title: string;
  type: string;
  emoticon?: string;
  color?: number;
};
```

## Shell parsing

Use `jq` for shell pipelines:

```sh
firetg dialogs list --limit 50 | jq '.[] | select(.unreadCount > 0)'
```

Check the process exit code before treating parsed JSON as a successful result. Both success and failure bodies are valid JSON.
