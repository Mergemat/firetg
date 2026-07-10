---
description: Configure credentials, session paths, XDG storage, file permissions, and account isolation.
---

# Configuration

firetg follows the XDG config directory convention and keeps all local state inside one `firetg` directory.

## Default paths

| Path | Contents |
| --- | --- |
| `~/.config/firetg/config.json` | Telegram API credentials |
| `~/.config/firetg/telegram.sqlite` | mtcute session and peer storage |
| `~/.config/firetg/session` | Legacy string session, migration input only |
| `~/.config/firetg/peers.json` | Legacy peer cache, migration input only |

## Credential file

`config.json` has this shape:

```json
{
  "apiId": 123456,
  "apiHash": "your-api-hash"
}
```

`apiId` must be a positive safe integer. `apiHash` must be a non-empty string. firetg rejects malformed JSON and invalid values with `CONFIG_ERROR`.

The normal path is to let `firetg auth login` create this file interactively.

## `XDG_CONFIG_HOME`

Set `XDG_CONFIG_HOME` to replace the `~/.config` base:

```sh
XDG_CONFIG_HOME="$HOME/.local/config" firetg profiles me
```

The resulting paths live under `$HOME/.local/config/firetg`.

## File security

firetg creates its directory with `0700` permissions and credential/session files with `0600` permissions. SQLite `-wal` and `-shm` companion files are secured when present.

These permissions reduce accidental local exposure, but they do not make copied session files safe. Keep the directory outside source control and backups shared with other people.

## Environment isolation

Use separate XDG directories to isolate environments or accounts:

```sh
XDG_CONFIG_HOME="$HOME/.config/firetg-work" firetg auth login
XDG_CONFIG_HOME="$HOME/.config/firetg-personal" firetg auth login
```

Each base receives its own nested `firetg` directory. Set the same environment variable on later commands to use the intended session.
