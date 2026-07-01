import { readPositiveInt } from "../args";
import { errorMessage, writeError, writeJson } from "../output";
import {
  activeProfileResolveBlock,
  enqueueProfileUsernames,
  markProfileResolveAttempt,
  markProfileResolveFailure,
  markProfileResolveSuccess,
  parseFloodWaitSeconds,
  pendingProfileResolveItems,
  profileResolveSummary,
  readProfileResolveState,
  readProfileUsernameList,
  recordProfileResolveFlood,
  writeProfileResolveState,
} from "../../profileResolver";
import {
  commandNow,
  matchesScopedCommand,
  runWithTelegram,
} from "./shared";
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
  run: ({ context }) =>
    runWithTelegram(context, async (telegram) => {
      writeJson(context, true, { data: await telegram.getMe() });
      return 0;
    }),
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
    const usesUsernameResolve = !id && !isNumericId(lookup);

    if (usesUsernameResolve) {
      const state = await readProfileResolveState(context.env);
      const previousBlockedUntil = state.blockedUntil;
      const block = activeProfileResolveBlock(state, commandNow(context));
      if (block) {
        writeProfileResolveBlockedError(context, block);
        return 2;
      }
      if (previousBlockedUntil && !state.blockedUntil) {
        await writeProfileResolveState(context.env, state);
      }
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.getProfile(lookup),
      });
      return 0;
    }, {
      onError: async (error) => {
        if (!usesUsernameResolve) return undefined;

        const waitSeconds = parseFloodWaitSeconds(error);
        if (waitSeconds === undefined) return undefined;

        const state = await readProfileResolveState(context.env);
        const block = recordProfileResolveFlood(
          state,
          waitSeconds,
          commandNow(context),
        );
        await writeProfileResolveState(context.env, state);
        writeProfileResolveBlockedError(context, block);
        return 2;
      },
    });
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
    const state = await readProfileResolveState(context.env);
    const now = commandNow(context);
    const usernames = readProfileUsernameList(
      parsed.flags.get("username") ?? parsed.flags.get("usernames"),
    );

    if (usernames.length === 0) {
      writeJson(context, true, { data: profileResolveSummary(state, now) });
      return 0;
    }

    const result = enqueueProfileUsernames(state, usernames, now);
    await writeProfileResolveState(context.env, state);

    writeJson(context, true, {
      data: {
        ...profileResolveSummary(state, now),
        enqueued: result.enqueued,
        skipped: result.skipped,
      },
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
    const state = await readProfileResolveState(context.env);
    const now = commandNow(context);
    const usernames = readProfileResolveUsernames(parsed);
    const queueResult = usernames.length
      ? enqueueProfileUsernames(state, usernames, now)
      : undefined;
    const block = activeProfileResolveBlock(state, now);

    if (block) {
      if (queueResult) await writeProfileResolveState(context.env, state);
      writeJson(context, true, {
        data: {
          ...profileResolveSummary(state, now),
          ...profileResolveQueueResult(queueResult),
          processed: [],
          errors: [],
        },
      });
      return 0;
    }

    await writeProfileResolveState(context.env, state);
    const pending = pendingProfileResolveItems(state, limit);
    if (pending.length === 0) {
      writeJson(context, true, {
        data: {
          ...profileResolveSummary(state, now),
          ...profileResolveQueueResult(queueResult),
          processed: [],
          errors: [],
        },
      });
      return 0;
    }

    return runWithTelegram(context, async (telegram) => {
      const processed: unknown[] = [];
      const errors: unknown[] = [];

      for (const item of pending) {
        const attemptAt = commandNow(context);
        markProfileResolveAttempt(item, attemptAt);

        try {
          const profile = await telegram.getProfile(item.username);
          markProfileResolveSuccess(item, profile, commandNow(context));
          processed.push({ username: item.username, profile });
          await writeProfileResolveState(context.env, state);
        } catch (error) {
          const waitSeconds = parseFloodWaitSeconds(error);
          if (waitSeconds !== undefined) {
            const floodBlock = recordProfileResolveFlood(
              state,
              waitSeconds,
              commandNow(context),
            );
            item.error = errorMessage(error);
            await writeProfileResolveState(context.env, state);
            writeJson(context, true, {
              data: {
                ...profileResolveSummary(state, commandNow(context)),
                ...profileResolveQueueResult(queueResult),
                blocked: true,
                blockedUntil: floodBlock.blockedUntil,
                remainingSeconds: floodBlock.remainingSeconds,
                processed,
                errors,
              },
            });
            return 0;
          }

          const message = errorMessage(error);
          markProfileResolveFailure(item, message, commandNow(context));
          errors.push({ username: item.username, error: message });
          await writeProfileResolveState(context.env, state);
        }
      }

      writeJson(context, true, {
        data: {
          ...profileResolveSummary(state, commandNow(context)),
          ...profileResolveQueueResult(queueResult),
          processed,
          errors,
        },
      });
      return 0;
    });
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
    const state = await readProfileResolveState(context.env);

    if (parsed.flags.has("clear-flood")) {
      delete state.blockedUntil;
      await writeProfileResolveState(context.env, state);
    }

    const now = commandNow(context);
    activeProfileResolveBlock(state, now);
    await writeProfileResolveState(context.env, state);
    writeJson(context, true, { data: profileResolveSummary(state, now) });
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
    const state = await readProfileResolveState(context.env);

    if (parsed.flags.has("clear")) {
      delete state.blockedUntil;
      await writeProfileResolveState(context.env, state);
    }

    const now = commandNow(context);
    activeProfileResolveBlock(state, now);
    await writeProfileResolveState(context.env, state);
    writeJson(context, true, { data: profileResolveSummary(state, now) });
    return 0;
  },
};

function readProfileResolveUsernames(parsed: {
  flags: Map<string, string>;
  positionals: string[];
}): string[] {
  return readProfileUsernameList(
    [
      parsed.flags.get("username"),
      parsed.flags.get("usernames"),
      ...parsed.positionals,
    ]
      .filter((value): value is string => Boolean(value))
      .join(","),
  );
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function profileResolveQueueResult(
  result?: { enqueued: string[]; skipped: string[] },
): { enqueued?: string[]; skipped?: string[] } {
  return result
    ? {
        enqueued: result.enqueued,
        skipped: result.skipped,
      }
    : {};
}

function writeProfileResolveBlockedError(
  context: CliContext,
  block: { blockedUntil: string; remainingSeconds: number },
) {
  writeError(
    context,
    "RATE_LIMITED",
    `Telegram username resolves are blocked until ${block.blockedUntil}`,
    {
      blockedUntil: block.blockedUntil,
      remainingSeconds: block.remainingSeconds,
    },
  );
}
