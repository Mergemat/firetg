import { readPositiveInt } from "../args";
import { writeError, writeJson } from "../output";
import {
  getOwnProfile,
  getProfileStatus,
  getPublicProfile,
  parseProfileUsernames,
  profileLookupFromInput,
  queueProfiles,
  resolveProfiles,
  type ProfileOperationResult,
} from "../../profiles";
import { matchesScopedCommand } from "./shared";
import type { CommandSpec } from "./types";
import type { CliContext } from "../types";

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
    return writeProfileOperationResult(
      context,
      await getOwnProfile(profileRuntime(context)),
    );
  },
};

export const profileViewCommand: CommandSpec = {
  id: "profiles.get",
  usage: "profiles get <username|user-id>",
  help: {
    summary: "Get one Telegram user profile",
    description:
      "Returns one Telegram profile by username or known user id as JSON.",
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
    const lookupKind = id ? "id" : username ? "username" : undefined;

    return writeProfileOperationResult(
      context,
      await getPublicProfile(
        profileRuntime(context),
        profileLookupFromInput(lookup, lookupKind),
      ),
    );
  },
};

export const profileQueueCommand: CommandSpec = {
  id: "profiles.queue",
  usage: "profiles queue [--username <username[,username...]>]",
  hidden: true,
  help: {
    summary: "Queue profile usernames for throttled resolution",
    description:
      "Adds Telegram usernames to the local resolver queue, or lists queue state when no username is passed.",
    options: [
      {
        name: "--username",
        value: "<username[,username...]>",
        summary: "One or more usernames, with or without @",
      },
    ],
    examples: [
      {
        command: "firetg profiles queue --username alice,bob",
        summary: "Queue two usernames",
      },
      {
        command: "firetg profiles queue",
        summary: "Show queued, resolved, failed, and flood state",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "profiles", "queue"),
  async run({ parsed, context }) {
    const usernames = parseProfileUsernames(
      parsed.flags.get("username") ?? parsed.flags.get("usernames"),
    );

    if (usernames.length === 0) {
      writeJson(context, true, {
        data: await getProfileStatus(profileRuntime(context)),
      });
      return 0;
    }

    writeJson(context, true, {
      data: await queueProfiles(profileRuntime(context), usernames),
    });
    return 0;
  },
};

export const profileResolveCommand: CommandSpec = {
  id: "profiles.resolve",
  usage: "profiles resolve [username...] [--limit <n>]",
  help: {
    summary: "Resolve profile usernames without burning retries",
    description:
      "Queues optional usernames, resolves pending usernames slowly, and records Telegram flood waits without retrying.",
    options: [
      {
        name: "--username",
        value: "<username[,username...]>",
        summary: "Legacy username list flag; positional usernames are preferred",
      },
      {
        name: "--limit",
        value: "<n>",
        summary: "Maximum queued usernames to resolve in this run",
        defaultValue: "1",
      },
    ],
    examples: [
      {
        command: "firetg profiles resolve alice bob",
        summary: "Queue usernames and resolve one",
      },
      {
        command: "firetg profiles resolve --limit 5",
        summary: "Resolve up to five queued usernames",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "profiles", "resolve"),
  async run({ parsed, context }) {
    const limit = Math.max(1, readPositiveInt(parsed.flags, "limit", 1));
    const usernames = readProfileResolveUsernames(parsed);

    return writeProfileOperationResult(
      context,
      await resolveProfiles(profileRuntime(context), { usernames, limit }),
    );
  },
};

export const profileStatusCommand: CommandSpec = {
  id: "profiles.status",
  usage: "profiles status [--clear-flood]",
  help: {
    summary: "Show profile resolver queue and flood state",
    description:
      "Shows queued, resolved, failed, and saved flood state for username profile resolution.",
    options: [
      {
        name: "--clear-flood",
        summary: "Clear the saved flood wait",
      },
    ],
    examples: [
      {
        command: "firetg profiles status",
        summary: "Show resolver queue and flood state",
      },
      {
        command: "firetg profiles status --clear-flood",
        summary: "Clear saved flood state",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "profiles", "status"),
  async run({ parsed, context }) {
    writeJson(context, true, {
      data: await getProfileStatus(profileRuntime(context), {
        clearFlood: parsed.flags.has("clear-flood"),
      }),
    });
    return 0;
  },
};

export const profileFloodCommand: CommandSpec = {
  id: "profiles.flood",
  usage: "profiles flood [--clear]",
  hidden: true,
  help: {
    summary: "Show or clear profile resolver flood state",
    description:
      "Shows when username profile resolves are locally blocked after Telegram FLOOD_WAIT.",
    options: [
      {
        name: "--clear",
        summary: "Clear the saved flood wait",
      },
    ],
    examples: [
      {
        command: "firetg profiles flood",
        summary: "Show current flood state",
      },
      {
        command: "firetg profiles flood --clear",
        summary: "Clear saved flood state",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "profiles", "flood"),
  async run({ parsed, context }) {
    writeJson(context, true, {
      data: await getProfileStatus(profileRuntime(context), {
        clearFlood: parsed.flags.has("clear"),
      }),
    });
    return 0;
  },
};

function readProfileResolveUsernames(parsed: {
  flags: Map<string, string>;
  positionals: string[];
}): string[] {
  return parseProfileUsernames(
    [
      parsed.flags.get("username"),
      parsed.flags.get("usernames"),
      ...parsed.positionals,
    ]
      .filter((value): value is string => Boolean(value))
      .join(","),
  );
}

function profileRuntime(context: CliContext) {
  return {
    env: context.env,
    createTelegram: context.createTelegram,
    now: context.now,
  };
}

function writeProfileOperationResult<T>(
  context: CliContext,
  result: ProfileOperationResult<T>,
): number {
  if (result.ok) {
    writeJson(context, true, { data: result.data });
    return 0;
  }

  const { code, message, exitCode, ...details } = result.error;
  writeError(context, code, message, details);
  return exitCode;
}
