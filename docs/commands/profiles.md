---
description: Read the current Telegram account or retrieve one user profile.
---

# profiles

Read the current account or one Telegram user profile.

## `profiles me`

```text
firetg profiles me
```

Returns the Telegram account attached to the stored session.

```sh
firetg profiles me
```

```json
{
  "id": "116040563",
  "firstName": "Fire",
  "username": "firetg",
  "lastName": "TG",
  "phone": "10000000000"
}
```

Optional fields are omitted when Telegram does not provide them. The legacy alias is `firetg me`.

## `profiles get`

```text
firetg profiles get <username|user-id>
```

Returns one Telegram user profile. Usernames may include the leading `@`. Numeric IDs must already be known to the current Telegram session.

```sh
firetg profiles get telegram
firetg profiles get @telegram
firetg profiles get 116040563
```

```json
{
  "id": "116040563",
  "firstName": "Telegram",
  "username": "telegram",
  "about": "Telegram's official account",
  "verified": true
}
```

The response can include:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Telegram user ID |
| `firstName` | string | Always present |
| `lastName` | string | Optional |
| `username` | string | Optional |
| `phone` | string | Optional and privacy-dependent |
| `about` | string | Profile bio, when available |
| `bot` | boolean | Bot account flag |
| `verified` | boolean | Telegram verification flag |
| `premium` | boolean | Premium account flag |
| `restricted` | boolean | Restricted account flag |
| `scam` | boolean | Telegram scam flag |
| `fake` | boolean | Telegram fake-account flag |

For compatibility, `profiles view --username <username>` and `profiles view --id <id>` are accepted, but the positional `profiles get` form is preferred.
