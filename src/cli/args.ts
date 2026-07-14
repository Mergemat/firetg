import { globalBooleanFlags } from "./options";

export type ParsedArgs = {
  raw: string[];
  command?: string;
  subcommand?: string;
  words: string[];
  positionals: string[];
  flags: Map<string, string>;
  flagCounts: Map<string, number>;
};

export function parseArgs(args: string[]): ParsedArgs {
  const { flags, flagCounts, words } = parseTokens(args);
  return {
    raw: args,
    command: words[0],
    subcommand: words[1],
    words,
    positionals: words.slice(words[0]?.includes(":") ? 1 : 2),
    flags,
    flagCounts,
  };
}

function parseTokens(args: string[]): {
  flags: Map<string, string>;
  flagCounts: Map<string, number>;
  words: string[];
} {
  const flags = new Map<string, string>();
  const flagCounts = new Map<string, number>();
  const words: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      if (arg) words.push(arg);
      continue;
    }

    const key = arg.slice(2);
    flagCounts.set(key, (flagCounts.get(key) ?? 0) + 1);
    if (globalBooleanFlags.has(key)) {
      flags.set(key, "");
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      flags.set(key, "");
      continue;
    }

    flags.set(key, value);
    index += 1;
  }

  return { flags, flagCounts, words };
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
