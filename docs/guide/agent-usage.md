---
description: Integrate firetg into an agent harness with safe permissions, JSON parsing, retries, and secret handling.
---

# Use with agents

firetg is designed to be a narrow Telegram tool in a larger agent harness.
Commands are scoped, successful results are machine-readable, and failures
include the context needed for the next action.

## Tool contract

Treat each invocation as this contract:

- Input arrives through command arguments.
- Success writes the result itself as one JSON value to stdout.
- Usage failure writes concise text plus relevant help to stdout.
- Operational failure writes a structured error object to stdout.
- Interactive prompts and output-file confirmations use stderr.
- Exit code `0` means success, `1` means local input or configuration failure, and `2` means Telegram, rate-limit, or timeout failure.

```ts
const process = Bun.spawn(
  ["firetg", "messages", "list", "--chat", "me", "--limit", "10"],
  { stdout: "pipe", stderr: "pipe" },
);

const stdout = await new Response(process.stdout).text();
const exitCode = await process.exited;

if (exitCode === 0) {
  const body = JSON.parse(stdout);
  // use body
} else {
  const body = stdout.startsWith("{") ? JSON.parse(stdout) : undefined;
  throw new Error(body?.error.message ?? stdout.trim());
}
```

## Verify readiness without prompts

Start unattended work with the offline status command:

```sh
firetg status --json --no-input
```

If `ready` is false or an authenticated command fails unexpectedly, run the
bounded deep diagnostic:

```sh
firetg doctor --json --no-input --timeout 15
```

Use `--no-input` on agent calls so new interactive behavior fails explicitly.
Use `--timeout <seconds>` to bound network operations. Treat a timed-out send
as potentially delivered and inspect the chat before retrying.

For results that should not enter the model context immediately, use a trusted
output path. firetg writes mode-`0600` files and leaves stdout empty:

```sh
firetg messages list --chat launch-team --limit 100 \
  --no-input --timeout 30 --output /tmp/launch-team.json
```

## Recommended permissions

Start with read-only commands:

```text
profiles me
profiles get
channels view
channels messages
channels pinned
messages list
messages search
messages pinned
dialogs list
folders list
```

Gate these commands behind explicit user intent:

```text
messages send
auth login
auth logout
```

`messages send` changes external state and can notify another person. Validate the recipient, message text, attachment path, and delivery time before execution.

## Prefer the scoped syntax

Use canonical two-part commands in tool definitions:

```sh
firetg messages send --username alice --text "hello"
```

Some older single-token aliases still work, including `send`, `me`, `messages:list`, and `dialogs:list`. Scoped commands are easier to discover and keep tool policies readable.

## Parse failures before retrying

Do not retry every nonzero exit code.

| Error code | Agent action |
| --- | --- |
| Plain usage text | Follow the included usage/help. Do not retry unchanged. |
| `CONFIG_ERROR` | Ask the user to configure or log in. |
| `INTERACTIVE_REQUIRED` | Ask the user to complete the interactive operation. |
| `RATE_LIMITED` | Wait until `blockedUntil`, then retry once. |
| `TELEGRAM_ERROR` | Report the Telegram failure or retry only when the operation is safe. |
| `TIMEOUT` | Retry reads only when safe; inspect delivery before retrying sends. |
| `OUTPUT_ERROR` | Choose a writable private output path. |

For a flood wait, use the structured timing fields:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Telegram rate-limited this action after too many similar requests. Retry at 2026-07-11T12:01:00.000Z (in 1m); avoid retrying it earlier or in parallel",
    "blockedUntil": "2026-07-11T12:01:00.000Z",
    "remainingSeconds": 60
  }
}
```

## Bound every read

Always pass `--limit` from agent code. Defaults are safe for interactive work, but explicit bounds make latency and context usage predictable.

```sh
firetg dialogs list --limit 20
firetg messages search --chat launch-team --hashtag deploy --limit 50
```

Limits must be between 1 and 100. Message text is a 1,000-character preview
by default and includes `textTruncated: true` when shortened. Use
`--full-text` only when the task requires complete bodies.

## Keep secrets out of prompts

Do not copy API hashes, session files, phone codes, or two-step verification passwords into an agent prompt. Complete `auth login` interactively in a trusted terminal, then let the agent use the stored session.

## Scheduled sends

`--schedule-at` accepts an ISO-8601 date-time or Unix seconds. Supply an explicit timezone offset to avoid host-timezone ambiguity:

```sh
firetg messages send \
  --username alice \
  --text "release is live" \
  --schedule-at 2026-07-11T18:00:00+03:00
```

The timestamp must be in the future. Telegram owns the scheduled delivery after accepting the command.
