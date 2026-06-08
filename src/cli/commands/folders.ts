import { writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const foldersListCommand: CommandSpec = {
  id: "folders.list",
  usage: "folders list",
  help: {
    summary: "List Telegram folders",
    description:
      "Returns configured Telegram dialog filters/folders as JSON.",
    examples: [
      {
        command: "firetg folders list",
        summary: "List configured folders",
      },
    ],
    aliases: ["folders:list"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "folders", "list") ||
    parsed.command === "folders:list",
  run: ({ context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, { data: await telegram.listFolders() });
      return 0;
    }),
};
