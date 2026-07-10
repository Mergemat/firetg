---
description: Parse firetg success values, error envelopes, and every JSON result type.
---

# JSON output

firetg writes one JSON value to stdout for every command. It does not wrap successful results in an `ok` or `data` envelope.

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

## Failure

Failures use a stable envelope:

```json
{
  "ok": false,
  "error": {
    "code": "INPUT_ERROR",
    "message": "messages list requires --chat"
  }
}
```

Read [Errors and exit codes](/reference/errors.md) for retry guidance.

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
  text: string;
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
