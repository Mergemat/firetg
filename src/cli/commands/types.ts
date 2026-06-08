import type { ParsedArgs } from "../args";
import type { CliContext } from "../types";

export type CommandInput = {
  parsed: ParsedArgs;
  context: CliContext;
};

export type CommandSpec = {
  id: string;
  usage: string;
  matches: (parsed: ParsedArgs) => boolean;
  run: (input: CommandInput) => Promise<number>;
};

export type CommandModule = {
  scope: string;
  commands: CommandSpec[];
};
