---
description: Handle firetg error codes, process exit codes, Telegram flood waits, and safe retries.
---

# Errors and exit codes

Failures are written to stdout and have a nonzero process exit code. Usage
failures are concise text with contextual help. Operational failures are JSON
when structured fields affect recovery.

```ts
type FireTgError = {
  ok: false;
  error: {
    code:
      | "CONFIG_ERROR"
      | "INTERACTIVE_REQUIRED"
      | "OUTPUT_ERROR"
      | "RATE_LIMITED"
      | "TELEGRAM_ERROR"
      | "TIMEOUT";
    message: string;
    blockedUntil?: string;
    remainingSeconds?: number;
  };
};
```

## Exit codes

| Exit code | Meaning | Typical response |
| --- | --- | --- |
| `0` | Success | Parse stdout as the command result |
| `1` | Input or local configuration failure | Fix arguments, configure credentials, or log in |
| `2` | Telegram, rate-limit, or timeout failure | Inspect the error code before retrying |

Help commands also exit with `0`. Unknown commands, unknown or duplicate
flags, extra arguments, missing flag values, and invalid numeric ranges exit
with `1`.

## Usage errors

Arguments are missing, contradictory, or invalid. These failures are plain
text and include canonical usage instead of a JSON envelope.

```text
channels view accepts either --username or --id, not both.
Usage: firetg channels view (--username <username> | --id <channel-id>)
```

Do not retry the same invocation. Fix the arguments first.

## `CONFIG_ERROR`

Credentials or Telegram session storage are missing, malformed, or unreadable.

```json
{
  "ok": false,
  "error": {
    "code": "CONFIG_ERROR",
    "message": "Missing Telegram login at /Users/you/.config/firetg/telegram.sqlite; run firetg auth login"
  }
}
```

Run `firetg auth login` in a trusted interactive terminal when the session is missing.

## `RATE_LIMITED`

Telegram returned a flood wait. firetg converts it to an absolute ISO timestamp and includes the remaining seconds.

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

Wait until `blockedUntil`. Do not retry the same action earlier or split it
across concurrent calls. mtcute automatically handles short waits internally;
surfaced waits require the caller to pause. Chat slow mode is reported
separately because it affects that chat rather than every Telegram action.

## `TELEGRAM_ERROR`

Telegram rejected the operation or the MTProto request failed for another reason.

```json
{
  "ok": false,
  "error": {
    "code": "TELEGRAM_ERROR",
    "message": "Telegram error message"
  }
}
```

Retry only when the operation is idempotent or you can verify whether it completed. Be especially careful with `messages send`, where a blind retry can duplicate a message.

## Agent-control failures

- `INTERACTIVE_REQUIRED` means `--no-input` prevented a prompt. Complete the
  operation in a trusted interactive terminal when appropriate.
- `TIMEOUT` means `--timeout <seconds>` expired. A timed-out send can have
  ambiguous delivery state, so inspect the chat before retrying.
- `OUTPUT_ERROR` means `--output` could not create or secure the destination
  file. The error is returned on stdout because no safe output file exists.

## Bun example

```ts
const child = Bun.spawn(
  ["firetg", "profiles", "get", "alice"],
  { stdout: "pipe", stderr: "pipe" },
);

const stdout = await new Response(child.stdout).text();
const exitCode = await child.exited;

if (exitCode === 0) {
  const result = JSON.parse(stdout);
  console.log(result.username);
} else {
  const result = stdout.startsWith("{") ? JSON.parse(stdout) : undefined;
  if (result?.error.code === "RATE_LIMITED") {
    console.error(`Retry after ${result.error.blockedUntil}`);
  } else {
    console.error(result?.error.message ?? stdout.trim());
  }
}
```
