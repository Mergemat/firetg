---
description: Check firetg readiness, local security, and live Telegram connectivity.
---

# Diagnostics

## `status`

```sh
firetg status --json
```

Returns a fast offline snapshot containing the firetg version, credential
state, session-storage state, relevant paths, and a `ready` boolean. It never
contacts Telegram and never returns API credentials.

`status` exits `0` even when `ready` is false because the command successfully
reported the current state. Use `doctor` when unhealthy state must fail a CI
or onboarding gate.

## `doctor`

```sh
firetg doctor --json --pretty --no-input --timeout 15
```

Checks:

- Bun runtime availability
- credential-file presence and validity
- SQLite or legacy session presence
- private file permissions
- a live Telegram `getMe` request

The response contains `ok`, `checks`, and—after successful authentication—a
non-private account summary. Each failed check includes a recovery command
when one is known. `doctor` exits `1` if a required check fails.
