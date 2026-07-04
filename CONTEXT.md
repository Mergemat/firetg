# firetg Context

firetg is an agent-ready Telegram MTProto CLI. It exposes Telegram capabilities as scoped command modules so agents can discover and call related actions consistently.

## Glossary

### Auth

Owns Telegram account authentication state.

- `auth login` creates API credentials when needed and stores a Telegram session.
- `auth logout` removes the stored Telegram session.
- Credentials and session files are Auth implementation details.

### Peer

Represents any Telegram destination: a user, group chat, or channel.

- Every command that accepts a username, id, or peer alias resolves it through one shared peer resolver.
- Resolved peers (id plus access hash) are cached in `peers.json`, so a peer is resolved against Telegram at most once.
- On a cache miss the resolver calls `contacts.ResolveUsername`; when Telegram flood-limits resolves it falls back to scanning dialogs and stores the flood deadline, refusing further resolve calls until it passes.
- Stale cached access hashes self-heal: the operation re-resolves the peer once and retries.
- Flood waits surface as `RATE_LIMITED` errors with `blockedUntil` and `remainingSeconds`.

### Profile

Represents the currently authenticated Telegram account.

- `profiles me` returns the current account profile.
- `profiles get <username|user-id>` returns a public user profile, including the Telegram bio/description when available.
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

- `messages send` sends a message to a peer, immediately or through Telegram-native scheduled delivery with `--schedule-at`.
- `messages list` reads message history for a chat, newest first.
- `messages search` searches a chat by hashtag, or searches replies to one message from selected senders.
- `messages pinned` reads pinned messages for a chat, newest first.
- Message summaries include `readReceipt` when Telegram exposes dialog read state.
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
