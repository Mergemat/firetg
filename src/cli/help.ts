import { commandModules } from "./commands";
import type { CommandModule, CommandSpec } from "./commands";

export function renderHelp(): string {
  const modules = commandModules
    .map((module) => `  ${module.scope.padEnd(10)} ${module.summary}`)
    .join("\n");

  return `firetg - agent-ready Telegram MTProto CLI

Usage:
  firetg <module> <command> [options]
  firetg <module>
  firetg <module> --help
  firetg <module> <command> --help

Modules:
${modules}

Output:
  JSON is written to stdout.
  Prompts, QR login, and diagnostics are written to stderr.

Run "firetg <module>" for module help.
`;
}

export function renderModuleHelp(module: CommandModule): string {
  const commands = module.commands
    .map((command) => {
      const name = command.id.slice(module.scope.length + 1);
      return `  ${name.padEnd(10)} ${command.help.summary}\n              firetg ${command.usage}`;
    })
    .join("\n");

  return `firetg ${module.scope} - ${module.summary}

${module.description ?? module.summary}

Usage:
  firetg ${module.scope} <command> [options]
  firetg ${module.scope} <command> --help

Commands:
${commands}

Options:
  --help      Show ${module.scope} help
`;
}

export function renderCommandHelp(command: CommandSpec): string {
  const sections = [
    renderSection("Options", command.help.options),
    renderSection("Aliases", command.help.aliases),
    renderSection("Examples", command.help.examples),
  ].filter((section) => section.length > 0);

  return [
    `firetg ${command.usage}`,
    "",
    command.help.description ?? command.help.summary,
    "",
    "Usage:",
    `  firetg ${command.usage}`,
    ...sections,
  ]
    .join("\n");
}

function renderSection(title: string, lines: string[] | undefined): string {
  if (!lines?.length) return "";

  return [
    "",
    `${title}:`,
    ...lines.map((line) => `  ${line}`),
  ].join("\n");
}
