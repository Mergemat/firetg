import type { CommandOption } from "./commands";

export const globalOptions: CommandOption[] = [
  {
    name: "--help",
    summary: "Show help for a command or module",
  },
  {
    name: "--json",
    summary: "Emit JSON explicitly (JSON is already the default)",
  },
  {
    name: "--output",
    value: "<path>",
    summary: "Write command output to a private file instead of stdout",
  },
  {
    name: "--pretty",
    summary: "Pretty-print JSON output",
  },
  {
    name: "--no-input",
    summary: "Fail instead of requesting interactive input",
  },
  {
    name: "--timeout",
    value: "<seconds>",
    summary: "Stop waiting after a positive number of seconds",
    number: { min: 0.001 },
  },
];

export const globalBooleanFlags = new Set(
  globalOptions
    .filter((option) => option.value === undefined)
    .map((option) => option.name.slice(2)),
);

export const globalOptionNames = new Set(
  globalOptions.map((option) => option.name.slice(2)),
);
