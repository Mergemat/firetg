import type { ParsedArgs } from "../args";
import type { CliContext } from "../types";

export type CommandInput = {
  parsed: ParsedArgs;
  context: CliContext;
};

export type CommandOption = {
  name: string;
  value?: string;
  summary: string;
  required?: boolean;
  defaultValue?: string;
};

export type CommandExample = {
  command: string;
  summary?: string;
};

export type CommandHelp = {
  summary: string;
  description?: string;
  options?: CommandOption[];
  examples?: CommandExample[];
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
