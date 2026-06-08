import type { ParsedArgs } from "../args";
import type { CliContext } from "../types";

export type CommandInput = {
  parsed: ParsedArgs;
  context: CliContext;
};

export type CommandHelp = {
  summary: string;
  description?: string;
  options?: string[];
  examples?: string[];
  aliases?: string[];
};

export type CommandSpec = {
  id: string;
  usage: string;
  help: CommandHelp;
  matches: (parsed: ParsedArgs) => boolean;
  run: (input: CommandInput) => Promise<number>;
};

export type CommandModule = {
  scope: string;
  summary: string;
  description?: string;
  commands: CommandSpec[];
};
