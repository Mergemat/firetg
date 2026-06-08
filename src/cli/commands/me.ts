import { writeError, writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const meCommand: CommandSpec = {
  id: "profiles.me",
  usage: "profiles me",
  help: {
    summary: "Show current Telegram account",
    description:
      "Returns the Telegram profile for the stored session as JSON.",
    options: ["--help    Show this help"],
    examples: ["firetg profiles me"],
    aliases: ["firetg me"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "profiles", "me") || parsed.command === "me",
  run: ({ context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, { data: await telegram.getMe() });
      return 0;
    }),
};

export const profileViewCommand: CommandSpec = {
  id: "profiles.view",
  usage: "profiles view --username <username>",
  help: {
    summary: "Show a Telegram user profile by username",
    description:
      "Returns the public Telegram profile for a username as JSON.",
    options: [
      "--username <username>    Telegram username, with or without @",
      "--help                   Show this help",
    ],
    examples: [
      "firetg profiles view --username telegram",
      "firetg profiles view --username @telegram",
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "profiles", "view"),
  run: ({ parsed, context }) => {
    const username = parsed.flags.get("username")?.trim();

    if (!username) {
      writeError(context, "INPUT_ERROR", "profiles view requires --username");
      return Promise.resolve(1);
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.getProfile(username),
      });
      return 0;
    });
  },
};
