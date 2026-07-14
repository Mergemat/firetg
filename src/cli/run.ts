import { parseArgs } from "./args";
import { commandModules, commandSpecs } from "./commands";
import type { CommandOption, CommandSpec } from "./commands";
import {
  renderCommandHelp,
  renderHelp,
  renderModuleHelp,
  renderUnknownCommandHelp,
} from "./help";
import { globalOptions } from "./options";
import { writeInputError } from "./output";
import { executeCommand } from "./runtime";
import type { CliContext } from "./types";

export async function runCli(
  args: string[],
  context: CliContext,
): Promise<number> {
  const parsed = parseArgs(args);

  if (args.length === 0 || (parsed.flags.has("help") && !parsed.command)) {
    context.io.stdout(renderHelp());
    return 0;
  }

  const command = commandSpecs.find((candidate) => candidate.matches(parsed));
  const module = commandModules.find(
    (candidate) => candidate.scope === parsed.command,
  );

  if (parsed.flags.has("help") && (command || module)) {
    context.io.stdout(
      command
        ? renderCommandHelp(command)
        : module
          ? renderModuleHelp(module)
          : renderHelp(),
    );
    return 0;
  }

  if (!command && module && parsed.subcommand === undefined) {
    context.io.stdout(renderModuleHelp(module));
    return 0;
  }

  if (!command) {
    context.io.stdout(renderUnknownCommandHelp(args, module));
    return 1;
  }

  const inputError = validateCommandInput(command, parsed);
  if (inputError) {
    writeInputError(context, command, inputError);
    return 1;
  }

  return executeCommand(command, parsed, context);
}

function validateCommandInput(
  command: CommandSpec,
  parsed: ReturnType<typeof parseArgs>,
): string | undefined {
  const options = new Map(
    [...(command.help.options ?? []), ...globalOptions].map((option) => [
      option.name.slice(2),
      option,
    ]),
  );

  for (const [flag, count] of parsed.flagCounts) {
    if (flag === "help") continue;
    const option = options.get(flag);
    if (!option) return `Unknown flag: --${flag}`;
    if (count > 1) return `Flag --${flag} was provided more than once`;

    const value = parsed.flags.get(flag) ?? "";
    const valueError = validateOptionValue(option, value);
    if (valueError) return valueError;
  }

  const positionals = commandPositionals(command, parsed);
  const maxPositionals = command.maxPositionals ?? 0;
  if (positionals.length > maxPositionals) {
    return `Unexpected argument: ${positionals[maxPositionals]}`;
  }
}

function commandPositionals(
  command: CommandSpec,
  parsed: ReturnType<typeof parseArgs>,
): string[] {
  const [scope, action] = command.id.split(".");
  const routeLength =
    action !== undefined &&
    parsed.command === scope &&
    parsed.subcommand === action
      ? 2
      : 1;
  return parsed.words.slice(routeLength);
}

function validateOptionValue(
  option: CommandOption,
  value: string,
): string | undefined {
  if (option.value && !value) {
    return `Flag ${option.name} requires ${option.value}`;
  }
  if (!option.value && value) return `Flag ${option.name} does not take a value`;
  if (option.integer && value) {
    const parsed = Number(value);
    const { min, max } = option.integer;
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < min ||
      (max !== undefined && parsed > max)
    ) {
      const range = max === undefined ? `${min} or greater` : `${min}-${max}`;
      return `Invalid ${option.name} value ${JSON.stringify(value)}; expected an integer in ${range}`;
    }
  }

  return validateNumberOption(option, value);
}

function validateNumberOption(
  option: CommandOption,
  value: string,
): string | undefined {
  if (!option.number || !value) return undefined;
  const parsed = Number(value);
  const { min, max } = option.number;
  if (
    !Number.isFinite(parsed) ||
    parsed < min ||
    (max !== undefined && parsed > max)
  ) {
    const range = max === undefined ? `${min} or greater` : `${min}-${max}`;
    return `Invalid ${option.name} value ${JSON.stringify(value)}; expected a number in ${range}`;
  }
}
