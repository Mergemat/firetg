---
description: List Telegram chats and scope dialog results by archive or custom folder.
---

# dialogs and folders

Dialogs are chat-list entries. Folders are Telegram dialog filters, including the archive.

## `dialogs list`

```text
firetg dialogs list [--folder <id>] [--limit <n>]
```

Reads recent dialogs, optionally scoped to a built-in or custom folder.

| Option | Default | Description |
| --- | --- | --- |
| `--folder <id>` | All dialogs | Folder ID from `folders list`, or `1` for archive |
| `--limit <n>` | `20` | Maximum dialogs to return |

```sh
firetg dialogs list
firetg dialogs list --folder 1 --limit 20
```

```json
[
  {
    "id": "-1001234567890",
    "title": "Launch team",
    "folderId": 1,
    "unreadCount": 3,
    "isUser": false,
    "isGroup": false,
    "isChannel": true
  }
]
```

The legacy alias is `firetg dialogs:list`.

## `folders list`

```text
firetg folders list
```

Returns configured Telegram dialog filters and folders.

```sh
firetg folders list
```

```json
[
  {
    "id": 2,
    "title": "Work",
    "type": "folder",
    "emoticon": "Briefcase"
  }
]
```

Use a returned `id` with `dialogs list --folder <id>`. Folder `1` represents the archive. The legacy alias is `firetg folders:list`.
