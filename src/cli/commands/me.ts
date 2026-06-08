import { writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const meCommand: CommandSpec = {
  id: "profiles.me",
  usage: "profiles me",
  matches: (parsed) =>
    matchesScopedCommand(parsed, "profiles", "me") || parsed.command === "me",
  run: ({ context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, { data: await telegram.getMe() });
      return 0;
    }),
};
