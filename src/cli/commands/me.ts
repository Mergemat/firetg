import { writeJson } from "../output";
import { runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const meCommand: CommandSpec = {
  id: "me",
  usage: "me",
  matches: (parsed) => parsed.command === "me",
  run: ({ context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, { data: await telegram.getMe() });
      return 0;
    }),
};
