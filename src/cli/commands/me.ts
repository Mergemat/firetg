import { writeInputError, writeSuccess } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const meCommand: CommandSpec = {
  id: "profiles.me",
  usage: "profiles me",
  help: {
    summary: "Show current Telegram account",
    description:
      "Returns the Telegram profile for the stored session as JSON.",
    options: [
      {
        name: "--include-private",
        summary: "Include the account phone number",
      },
    ],
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
  async run({ parsed, context }) {
    return runWithTelegram(context, async (telegram) => {
      const account = await telegram.getMe();
      writeSuccess(context, {
        data: parsed.flags.has("include-private") ? account : withoutPhone(account),
      });
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
      {
        name: "--include-private",
        summary: "Include a phone number when Telegram exposes one",
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
  maxPositionals: 1,
  matches: (parsed) =>
    matchesScopedCommand(parsed, "profiles", "get") ||
    matchesScopedCommand(parsed, "profiles", "view"),
  async run({ parsed, context }) {
    const label = parsed.subcommand === "get" ? "profiles get" : "profiles view";
    const positionalLookup = parsed.positionals[0]?.trim();
    const username = parsed.flags.get("username")?.trim();
    const id = parsed.flags.get("id")?.trim();

    if (parsed.positionals.length > 1) {
      writeInputError(context, profileViewCommand, `${label} accepts one profile lookup`);
      return 1;
    }

    if (!positionalLookup && !username && !id) {
      writeInputError(
        context,
        profileViewCommand,
        parsed.subcommand === "get"
          ? "profiles get requires <username|user-id>"
          : "profiles view requires --username or --id",
      );
      return 1;
    }

    if ([positionalLookup, username, id].filter(Boolean).length > 1) {
      writeInputError(
        context,
        profileViewCommand,
        parsed.subcommand === "get"
          ? "profiles get accepts one profile lookup"
          : "profiles view accepts either --username or --id, not both",
      );
      return 1;
    }

    const lookup = positionalLookup ?? username ?? id ?? "";

    return runWithTelegram(context, async (telegram) => {
      const profile = await telegram.getProfile(lookup);
      writeSuccess(context, {
        data: parsed.flags.has("include-private") ? profile : withoutPhone(profile),
      });
      return 0;
    });
  },
};

function withoutPhone<T extends { phone?: string }>(profile: T): Omit<T, "phone"> {
  const copy = { ...profile };
  delete copy.phone;
  return copy;
}
