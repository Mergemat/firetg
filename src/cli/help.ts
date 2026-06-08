import { commandModules } from "./commands";
import type { CommandModule, CommandOption, CommandSpec } from "./commands";

const globalOptions: CommandOption[] = [
  {
    name: "--help",
    summary: "Show help for a command or module",
  },
];

export function renderHelp(): string {
  const modules = renderRows(
    commandModules.map((module) => [module.scope, module.summary]),
  );

  return `firetg - agent-ready Telegram MTProto CLI

USAGE
  firetg <module> <command> [flags]

COMMAND GROUPS
${modules}

GETTING STARTED
  firetg auth login
  firetg profiles me
  firetg messages list --chat me --limit 20

OUTPUT
  JSON is written to stdout.
  Prompts, QR login, and diagnostics are written to stderr.

FLAGS
${renderOptions(globalOptions)}

Use "firetg <module>" for group help and "firetg <module> <command> --help" for command help.
`;
}

export function renderModuleHelp(module: CommandModule): string {
  const commands = renderRows(
    module.commands.map((command) => [
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

export function renderCommandHelp(command: CommandSpec): string {
  const sections = [
    renderOptionSection([...(command.help.options ?? []), ...globalOptions]),
    renderAliasSection(command.help.aliases),
    renderExampleSection(command.help.examples),
  ].filter((section) => section.length > 0);

  return [
    `firetg ${commandPath(command)} - ${command.help.summary}`,
    "",
    command.help.description ?? command.help.summary,
    "",
    "USAGE",
    `  firetg ${command.usage}`,
    ...sections,
  ]
    .join("\n");
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
  const flags: [string, string][] = options.map((option) => [
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
  return command.id.slice(command.id.indexOf(".") + 1);
}

function commandPath(command: CommandSpec): string {
  return command.id.replace(".", " ");
}
