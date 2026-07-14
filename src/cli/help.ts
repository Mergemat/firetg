import { commandModules, topLevelCommands } from "./commands";
import type { CommandModule, CommandOption, CommandSpec } from "./commands";
import { globalOptions } from "./options";

export function renderHelp(): string {
  const commands = renderRows(
    topLevelCommands.map((command) => [command.id, command.help.summary]),
  );
  const modules = renderRows(
    commandModules.map((module) => [module.scope, module.summary]),
  );

  return `firetg - agent-ready Telegram MTProto CLI

USAGE
  firetg <command> [flags]
  firetg <module> <command> [flags]

COMMANDS
${commands}

COMMAND GROUPS
${modules}

GETTING STARTED
  firetg auth login
  firetg status --json
  firetg doctor --json --no-input --timeout 15
  firetg profiles me
  firetg channels messages --username telegram --limit 20
  firetg channels pinned --username telegram --limit 20

OUTPUT
  Successful results and operational errors use JSON on stdout.
  Usage errors use concise text with relevant help.
  Prompts, QR login, and output-file confirmations use stderr.

FLAGS
${renderOptions(globalOptions)}

Use "firetg <command> --help" or "firetg <module> <command> --help" for command help.
`;
}

export function renderModuleHelp(module: CommandModule): string {
  const commands = renderRows(
    module.commands
      .filter((command) => !command.hidden)
      .map((command) => [
        commandName(command),
        [
          command.help.summary,
          `firetg ${command.usage}`,
          ...(command.help.aliases?.map((alias) => `alias: firetg ${alias}`) ??
            []),
        ],
      ]),
  );

  return `firetg ${module.scope} - ${module.summary}

${module.description ?? module.summary}

USAGE
  firetg ${module.scope} <command> [flags]

COMMANDS
${commands}

FLAGS
${renderOptions(globalOptions)}
`;
}

export function renderUnknownCommandHelp(
  args: string[],
  module?: CommandModule,
): string {
  const error = `Unknown command: ${args.join(" ")}.`;

  if (module) {
    const commands = module.commands
      .filter((command) => !command.hidden)
      .map((command) => `  firetg ${command.usage}`)
      .join("\n");
    return `${error}\n\nAvailable ${module.scope} commands:\n${commands}\n`;
  }

  const modules = commandModules
    .map((candidate) => `  ${candidate.scope} - ${candidate.summary}`)
    .join("\n");
  return `${error}\n\nAvailable command groups:\n${modules}\n`;
}

export function renderCommandHelp(command: CommandSpec): string {
  const sections = [
    renderOptionSection([...(command.help.options ?? []), ...globalOptions]),
    renderAliasSection(command.help.aliases),
    renderExampleSection(command.help.examples),
  ].filter((section) => section.length > 0);

  return `${[
    `firetg ${commandPath(command)} - ${command.help.summary}`,
    "",
    command.help.description ?? command.help.summary,
    "",
    "USAGE",
    `  firetg ${command.usage}`,
    ...sections,
  ].join("\n")}\n`;
}

function renderOptionSection(options: CommandOption[]): string {
  if (options.length === 0) return "";

  return [
    "",
    "FLAGS",
    renderOptions(options),
  ].join("\n");
}

function renderOptions(options: CommandOption[]): string {
  const flags: [string, string][] = options.filter((option) => !option.hidden).map((option) => [
    optionLabel(option),
    optionDescription(option),
  ]);

  return renderRows(flags);
}

function renderAliasSection(aliases: string[] | undefined): string {
  if (!aliases?.length) return "";

  return [
    "",
    "ALIASES",
    ...aliases.map((alias) => `  firetg ${alias}`),
  ].join("\n");
}

function renderExampleSection(
  examples: CommandSpec["help"]["examples"],
): string {
  if (!examples?.length) return "";

  return [
    "",
    "EXAMPLES",
    ...examples.map((example) =>
      example.summary === undefined
        ? `  ${example.command}`
        : `  # ${example.summary}\n  ${example.command}`,
    ),
  ].join("\n");
}

function renderRows(rows: [string, string | string[]][]): string {
  if (rows.length === 0) return "";

  const width = Math.max(...rows.map(([left]) => left.length));

  return rows
    .map(([left, right]) => {
      const lines = Array.isArray(right) ? right : [right];
      const [first = "", ...rest] = lines;
      return [
        `  ${left.padEnd(width)}  ${first}`,
        ...rest.map((line) => `  ${" ".repeat(width)}  ${line}`),
      ].join("\n");
    })
    .join("\n");
}

function optionLabel(option: CommandOption): string {
  return [option.name, option.value].filter(Boolean).join(" ");
}

function optionDescription(option: CommandOption): string {
  return [
    option.summary,
    option.required ? "(required)" : undefined,
    option.defaultValue === undefined
      ? undefined
      : `(default ${option.defaultValue})`,
  ]
    .filter(Boolean)
    .join(" ");
}

function commandName(command: CommandSpec): string {
  const separator = command.id.indexOf(".");
  return separator === -1 ? command.id : command.id.slice(separator + 1);
}

function commandPath(command: CommandSpec): string {
  return command.id.replace(".", " ");
}
