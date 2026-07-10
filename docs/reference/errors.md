---
description: Handle firetg error codes, process exit codes, Telegram flood waits, and safe retries.
---

# Errors and exit codes

Failures are JSON on stdout and have a nonzero process exit code.

```ts
type FireTgError = {
  ok: false;
  error: {
    code: "CONFIG_ERROR" | "INPUT_ERROR" | "RATE_LIMITED" | "TELEGRAM_ERROR";
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
| `2` | Telegram or rate-limit failure | Inspect the error code before retrying |

Help commands also exit with `0`. Unknown commands and invalid positive integer flags exit with `1`.

## `INPUT_ERROR`

Arguments are missing, contradictory, or invalid.

```json
{
  "ok": false,
  "error": {
    "code": "INPUT_ERROR",
    "message": "channels view accepts either --username or --id, not both"
  }
}
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
    "message": "Telegram flood wait: retry after 2026-07-11T12:01:00.000Z",
    "blockedUntil": "2026-07-11T12:01:00.000Z",
    "remainingSeconds": 60
  }
}
```

Wait until `blockedUntil`. Do not loop rapidly, and do not split the same work across concurrent calls to evade Telegram limits.

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

## Bun example

```ts
const child = Bun.spawn(
  ["firetg", "profiles", "get", "alice"],
  { stdout: "pipe", stderr: "pipe" },
);

const result = await new Response(child.stdout).json();
const exitCode = await child.exited;

if (exitCode === 0) {
  console.log(result.username);
} else if (result.error.code === "RATE_LIMITED") {
  console.error(`Retry after ${result.error.blockedUntil}`);
} else {
  console.error(result.error.message);
}
```
