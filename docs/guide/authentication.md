---
description: Log in by QR or phone, manage local session files, migrate legacy sessions, and log out safely.
---

# Authentication

firetg stores Telegram API credentials and an authenticated MTProto session on the local machine.

## QR login

QR is the default flow:

```sh
firetg auth login
```

The terminal prints a QR code. In Telegram, open **Settings > Devices > Link Desktop Device**, then scan the code. QR codes expire, so firetg replaces the displayed code when Telegram issues a fresh one and clears it when login finishes.

If two-step verification is enabled, firetg asks for the account password after the QR scan. API hashes, login codes, and passwords are hidden while you type and require an interactive terminal.

## Phone login

Use `--phone` when scanning a QR code is inconvenient:

```sh
firetg auth login --phone
```

firetg prompts for:

1. Phone number, including the country code
2. The code sent by Telegram or SMS
3. The two-step verification password, when enabled

An entered number without a leading `+` is normalized automatically when it contains digits only.

## Local files

The default directory is `~/.config/firetg`.

| File | Purpose | Permissions |
| --- | --- | --- |
| `config.json` | Telegram API ID and API hash | `0600` |
| `telegram.sqlite` | Auth session, peer cache, and access hashes | `0600` |
| `telegram.sqlite-wal` | SQLite write-ahead log, when present | `0600` |
| `telegram.sqlite-shm` | SQLite shared memory, when present | `0600` |

The firetg directory is created with `0700` permissions.

::: warning Protect the session
Anyone who can read the SQLite session may be able to act as your Telegram account. Do not commit, upload, or share files from the firetg config directory.
:::

## Move the config directory

Set `XDG_CONFIG_HOME` before running firetg:

```sh
XDG_CONFIG_HOME="$HOME/.local/config" firetg profiles me
```

firetg appends `/firetg` to that value. In this example it reads `$HOME/.local/config/firetg`.

## Legacy session migration

Existing Teleproto or GramJS string sessions are detected at:

```text
~/.config/firetg/session
```

On the first authenticated command, firetg converts the string session through mtcute and verifies the imported account. After a successful conversion, it removes the legacy `session` and `peers.json` files.

If conversion fails, run a fresh login:

```sh
firetg auth login
```

## Log out

```sh
firetg auth logout
```

firetg asks Telegram to log out the current session when possible, then removes the local SQLite database and legacy session files even if remote revocation fails. The JSON result reports `localRemoved` and `remoteRevoked` separately. API credentials remain in `config.json`, ready for the next login.

To use a different API application, remove or replace `config.json` before logging in again.
