import { writeJson } from "../output";
import { runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const foldersListCommand: CommandSpec = {
  id: "folders.list",
  usage: "folders:list",
  matches: (parsed) => parsed.command === "folders:list",
  run: ({ context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, { data: await telegram.listFolders() });
      return 0;
    }),
};
