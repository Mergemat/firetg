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
- Use Profile for account identity reads, not Auth.

### Message

Represents Telegram message actions for a peer.

- `messages send` sends a message to a peer.
- `messages list` reads message history for a chat.
- Folders organize dialogs, not message streams.

### Dialog

Represents a Telegram chat entry in the user's dialog list.

- `dialogs list` lists chats.
- Dialogs can be scoped to a Folder.

### Folder

Represents Telegram dialog filters and the archive.

- `folders list` lists configured dialog filters.
- Archive peer folder `1` and custom dialog filter ids can scope Dialog listing.
