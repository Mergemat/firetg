# Contributing to firetg

Thank you for helping improve firetg.

## Development

Install dependencies with Bun:

```bash
bun install --frozen-lockfile
bun install --cwd docs --frozen-lockfile
```

Before opening a pull request, run:

```bash
bun run typecheck
bun test
bun run --cwd docs build
bun pm pack --dry-run
```

Keep changes focused, update tests and documentation when behavior changes,
and use Conventional Commit syntax for commit messages.

## Pull requests

Describe the problem, the chosen solution, and how the change was verified.
Do not include Telegram credentials, session databases, private messages,
phone numbers, or other account data in issues, logs, fixtures, or screenshots.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.
