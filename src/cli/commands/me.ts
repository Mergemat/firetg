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
    examples: [
      {
        command: "firetg profiles me",
        summary: "Print the authenticated account profile",
      },
    ],
    aliases: ["me"],
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
      {
        name: "--username",
        value: "<username>",
        summary: "Telegram username, with or without @",
        required: true,
      },
    ],
    examples: [
      {
        command: "firetg profiles view --username telegram",
        summary: "Lookup a public username",
      },
      {
        command: "firetg profiles view --username @telegram",
        summary: "Lookup a username with @ prefix",
      },
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
