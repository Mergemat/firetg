import { commandSpecs } from "./commands";

export function renderHelp(): string {
  const commands = commandSpecs
    .map((command) => `  ${command.usage}`)
    .join("\n");

  return `firetg

Commands:
${commands}

Options:
  --help      Show help
`;
}
