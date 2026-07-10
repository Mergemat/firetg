export type ParsedArgs = {
  raw: string[];
  command?: string;
  subcommand?: string;
  positionals: string[];
  flags: Map<string, string>;
  flagCounts: Map<string, number>;
};

export function parseArgs(args: string[]): ParsedArgs {
  const { flags, flagCounts } = parseFlags(args);
  return {
    raw: args,
    command: args[0],
    subcommand: args[1],
    positionals: parsePositionals(args),
    flags,
    flagCounts,
  };
}

function parseFlags(args: string[]): {
  flags: Map<string, string>;
  flagCounts: Map<string, number>;
} {
  const flags = new Map<string, string>();
  const flagCounts = new Map<string, number>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) continue;

    const key = arg.slice(2);
    flagCounts.set(key, (flagCounts.get(key) ?? 0) + 1);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      flags.set(key, "");
      continue;
    }

    flags.set(key, value);
    index += 1;
  }

  return { flags, flagCounts };
}

function parsePositionals(args: string[]): string[] {
  const positionals: string[] = [];
  const start = args[0]?.includes(":") ? 1 : 2;

  for (let index = start; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg.startsWith("--")) {
      const value = args[index + 1];
      if (value && !value.startsWith("--")) index += 1;
      continue;
    }

    positionals.push(arg);
  }

  return positionals;
}

export function readPositiveInt(
  flags: Map<string, string>,
  key: string,
  fallback: number,
): number {
  const value = flags.get(key);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
