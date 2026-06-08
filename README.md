# firetg

Agent-ready Telegram MTProto CLI built on Teleproto and Bun.

## Install

```bash
bun install
```

## Configure

Create an app at https://my.telegram.org/apps, then log in once:

```bash
bun run index.ts auth login
```

The CLI prompts for API ID/hash, prints a QR code to stderr, and stores the resulting session after you scan it in Telegram.

Phone-code login is available as a fallback:

```bash
bun run index.ts auth login --phone
```

Phone login prompts for:

- API ID
- API hash
- phone number
- Telegram login code
- 2FA password, when your account requires it

By default, credentials are stored in `~/.config/firetg/config.json` and the session is stored in `~/.config/firetg/session`. The CLI creates the config directory with `0700` permissions and both files with `0600` permissions.

## Commands

Help is available globally, per module, and per command:

```bash
bun run index.ts --help
bun run index.ts auth
bun run index.ts messages --help
bun run index.ts messages list --help
```

```bash
bun run index.ts auth login
bun run index.ts auth login --phone
bun run index.ts auth logout
bun run index.ts profiles me
bun run index.ts messages send --to me --text "hello"
bun run index.ts folders list
bun run index.ts dialogs list --folder 1 --limit 20
bun run index.ts messages list --chat me --limit 20
bun run index.ts messages list --chat me --search deploy --limit 10
```

Telegram folder notes:

- `folders list` reads configured dialog filters via MTProto.
- `dialogs list --folder 1` lists Telegram's archive peer folder.
- `dialogs list --folder <custom-filter-id>` lists chats matching a custom chat folder from `folders list`.
- `messages list` reads history for a single chat; folders organize dialogs, not message streams.

## Agent Contract

- Commands write machine-readable JSON to stdout by default.
- Human prompts and diagnostics go to stderr.
- Exit `0`: success.
- Exit `1`: input/config error.
- Exit `2`: Telegram/API error.
- Required setup: run `auth login` once so the CLI can create `config.json` and `session`.
- Legacy aliases like `me`, `send`, `folders:list`, `dialogs:list`, and `messages:list` still work, but scoped commands are the public flow.

Successful responses:

```json
{"ok":true,"data":{}}
```

Failed responses:

```json
{"ok":false,"error":{"code":"CONFIG_ERROR","message":"Missing config file at /path/to/config.json"}}
```
