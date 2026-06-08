import { readPositiveInt } from "../args";
import { writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const dialogsListCommand: CommandSpec = {
  id: "dialogs.list",
  usage: "dialogs list [--folder <id>] [--limit <n>]",
  help: {
    summary: "List chats/dialogs",
    description:
      "Reads Telegram dialogs, optionally scoped to a built-in or custom folder.",
    options: [
      {
        name: "--folder",
        value: "<id>",
        summary: "Folder id from folders list, or 1 for archive",
      },
      {
        name: "--limit",
        value: "<n>",
        summary: "Maximum dialogs to return",
        defaultValue: "20",
      },
    ],
    examples: [
      {
        command: "firetg dialogs list",
        summary: "List recent dialogs",
      },
      {
        command: "firetg dialogs list --folder 1 --limit 20",
        summary: "List archived dialogs",
      },
    ],
    aliases: ["dialogs:list"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "dialogs", "list") ||
    parsed.command === "dialogs:list",
  run: ({ parsed, context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.listDialogs({
          limit: readPositiveInt(parsed.flags, "limit", 20),
          folder:
            parsed.flags.get("folder") === undefined
              ? undefined
              : readPositiveInt(parsed.flags, "folder", 0),
        }),
      });
      return 0;
    }),
};
