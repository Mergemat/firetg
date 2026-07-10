---
description: Create, revoke, and remove the local Telegram authentication session.
---

# auth

Create, revoke, and remove the local Telegram session.

## `auth login`

```text
firetg auth login [--phone]
```

Starts Telegram authorization. QR login is used by default.

| Option | Description |
| --- | --- |
| `--phone` | Use phone-code login instead of QR login |

```sh
# QR login
firetg auth login

# Phone-code login
firetg auth login --phone
```

On success:

```json
{"loggedIn":true}
```

Exit code is `1` for invalid input or local configuration errors and `2` for Telegram failures.

## `auth logout`

```text
firetg auth logout
```

Logs out the stored Telegram session when possible, then removes the local session database. It also removes legacy session state.

```sh
firetg auth logout
```

On success:

```json
{"loggedOut":true,"localRemoved":true,"remoteRevoked":true}
```

If Telegram cannot revoke the remote session, the command still removes local state and returns an error containing `"localRemoved":true` and `"remoteRevoked":false`.

The API credentials in `config.json` are not removed.

See [Authentication](/guide/authentication.md) for the complete login flow and file layout.
