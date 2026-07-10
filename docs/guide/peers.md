---
description: Address Telegram users, groups, channels, and Saved Messages using usernames, IDs, or aliases.
---

# Peers and IDs

A peer is any Telegram destination that firetg can resolve: a user, group, channel, or your own Saved Messages.

## Accepted forms

| Input | Meaning | Example |
| --- | --- | --- |
| Username | Public or previously resolved peer | `alice`, `@alice` |
| User ID | Known Telegram user ID | `116040563` |
| Marked channel ID | Full Telegram channel ID | `-1001234567890` |
| Group ID | Negative basic-group ID | `-4242` |
| Self alias | Your own account or Saved Messages | `me`, `self`, `this` |

The leading `@` on usernames is optional.

```sh
firetg profiles get @alice
firetg messages list --chat alice
firetg messages list --chat me
```

## Channel IDs

Channel commands know that a positive numeric `--id` is a channel ID and apply Telegram's marked channel form internally:

```sh
firetg channels view --id 100
```

For generic `--chat` arguments, pass either a resolvable username or the full marked ID such as `-1001234567890`.

## Resolution and caching

Telegram operations often need both an ID and an access hash. Resolving a public username stores that information in the local mtcute SQLite database. Later calls can use cached peer data and avoid unnecessary username resolutions.

This matters for numeric IDs: a bare ID is useful only when Telegram already knows the corresponding peer in the current session. Resolve or encounter the peer first if an ID lookup fails.

## Choosing a command group

- Use `profiles` for Telegram user identity and bio data.
- Use `channels` for broadcast-channel metadata and channel history.
- Use `messages` for peer message streams and sending.
- Use `dialogs` for the account's chat list.
- Use `folders` to discover dialog filters and archive scope.

Channel commands require exactly one of `--username` or `--id`. Message read commands use the more general `--chat` argument.

## Safe integer limit

Numeric peer IDs must fit within JavaScript's safe integer range. firetg rejects larger values instead of silently rounding them. Pass a username when a supplied numeric value is not valid.
