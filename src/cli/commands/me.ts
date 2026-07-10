import { writeError, writeSuccess } from "../output";
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
  async run({ context }) {
    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, { data: await telegram.getMe() });
      return 0;
    });
  },
};

export const profileViewCommand: CommandSpec = {
  id: "profiles.get",
  usage: "profiles get <username|user-id>",
  help: {
    summary: "Get one Telegram user profile",
    description:
      "Returns one Telegram profile by username or known user id as JSON. Resolved peers are cached locally, so repeat lookups avoid Telegram resolve limits.",
    options: [
      {
        name: "--username",
        value: "<username>",
        summary: "Legacy Telegram username flag, with or without @",
      },
      {
        name: "--id",
        value: "<user-id>",
        summary: "Legacy known Telegram user id flag",
      },
    ],
    examples: [
      {
        command: "firetg profiles get telegram",
        summary: "Get a public username",
      },
      {
        command: "firetg profiles get @telegram",
        summary: "Get a username with @ prefix",
      },
      {
        command: "firetg profiles get 123456789",
        summary: "Get a known user id",
      },
    ],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "profiles", "get") ||
    matchesScopedCommand(parsed, "profiles", "view"),
  async run({ parsed, context }) {
    const label = parsed.subcommand === "get" ? "profiles get" : "profiles view";
    const positionalLookup = parsed.positionals[0]?.trim();
    const username = parsed.flags.get("username")?.trim();
    const id = parsed.flags.get("id")?.trim();

    if (parsed.positionals.length > 1) {
      writeError(context, "INPUT_ERROR", `${label} accepts one profile lookup`);
      return 1;
    }

    if (!positionalLookup && !username && !id) {
      writeError(
        context,
        "INPUT_ERROR",
        parsed.subcommand === "get"
          ? "profiles get requires <username|user-id>"
          : "profiles view requires --username or --id",
      );
      return 1;
    }

    if ([positionalLookup, username, id].filter(Boolean).length > 1) {
      writeError(
        context,
        "INPUT_ERROR",
        parsed.subcommand === "get"
          ? "profiles get accepts one profile lookup"
          : "profiles view accepts either --username or --id, not both",
      );
      return 1;
    }

    const lookup = positionalLookup ?? username ?? id ?? "";

    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, { data: await telegram.getProfile(lookup) });
      return 0;
    });
  },
};
