import { readPositiveInt } from "../args";
import { writeJson } from "../output";
import { runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const dialogsListCommand: CommandSpec = {
  id: "dialogs.list",
  usage: "dialogs:list [--folder <id>] [--limit <n>]",
  matches: (parsed) => parsed.command === "dialogs:list",
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
