# firetg Context

firetg is an agent-ready Telegram MTProto CLI. It exposes Telegram capabilities as scoped command modules so agents can discover and call related actions consistently.

## Glossary

### Auth

Owns Telegram account authentication state.

- `auth login` creates API credentials when needed and stores a Telegram session.
- `auth logout` removes the stored Telegram session.
- Credentials and session files are Auth implementation details.

### Profile

Represents the currently authenticated Telegram account.

- `profiles me` returns the current account profile.
- `profiles view --username <username>` returns a public user profile, including the Telegram bio/description when available.
- Use Profile for account identity reads, not Auth.

### Channel

Represents a Telegram broadcast channel.

- `channels view --username <username>` returns channel metadata.
- `channels messages --username <username>` reads channel message history, newest first.
- `channels pinned --username <username>` reads pinned channel messages, newest first.
- Channel metadata includes the description and pinned message when Telegram exposes them.
- Use Channel for broadcast channel details, not Dialog list entries.

### Message

Represents Telegram message actions for a peer.

- `messages send` sends a message to a peer.
- `messages list` reads message history for a chat, newest first.
- `messages search` searches a chat by hashtag, or searches replies to one message from selected senders.
- `messages pinned` reads pinned messages for a chat, newest first.
- Prefer Channel commands for broadcast channels.
- Folders organize dialogs, not message streams.

### Dialog

Represents a Telegram chat entry in the user's dialog list.

- `dialogs list` lists chats.
- Dialogs can be scoped to a Folder.

### Folder

Represents Telegram dialog filters and the archive.

- `folders list` lists configured dialog filters.
- Archive peer folder `1` and custom dialog filter ids can scope Dialog listing.
