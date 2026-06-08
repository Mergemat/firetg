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
  usage: "profiles view (--username <username> | --id <user-id>)",
  help: {
    summary: "Show a Telegram user profile by username or id",
    description:
      "Returns the public Telegram profile for a username or known user id as JSON.",
    options: [
      {
        name: "--username",
        value: "<username>",
        summary: "Telegram username, with or without @",
      },
      {
        name: "--id",
        value: "<user-id>",
        summary: "Known Telegram user id",
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
      {
        command: "firetg profiles view --id 123456789",
        summary: "Lookup a known user id",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "profiles", "view"),
  run: ({ parsed, context }) => {
    const username = parsed.flags.get("username")?.trim();
    const id = parsed.flags.get("id")?.trim();

    if (!username && !id) {
      writeError(
        context,
        "INPUT_ERROR",
        "profiles view requires --username or --id",
      );
      return Promise.resolve(1);
    }

    if (username && id) {
      writeError(
        context,
        "INPUT_ERROR",
        "profiles view accepts either --username or --id, not both",
      );
      return Promise.resolve(1);
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.getProfile(username ?? id ?? ""),
      });
      return 0;
    });
  },
};
