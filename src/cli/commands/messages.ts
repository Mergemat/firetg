import { readPositiveInt } from "../args";
import { writeInputError, writeSuccess } from "../output";
import {
  matchesScopedCommand,
  messagesForOutput,
  runWithTelegram,
} from "./shared";
import type { CommandSpec } from "./types";

export const messagesListCommand: CommandSpec = {
  id: "messages.list",
  usage: "messages list --chat <peer> [--limit <n>] [--search <query>]",
  help: {
    summary: "List messages from a chat",
    description:
      "Reads recent message history for one Telegram chat or peer.",
    options: [
      {
        name: "--chat",
        value: "<peer>",
        summary: "Chat, username, id, or peer alias",
        required: true,
      },
      {
        name: "--limit",
        value: "<n>",
        summary: "Maximum messages to return",
        defaultValue: "20",
        integer: { min: 1, max: 100 },
      },
      {
        name: "--search",
        value: "<query>",
        summary: "Search query within the chat history",
      },
      {
        name: "--full-text",
        summary:
          "Return complete message text instead of the 1000-character preview",
      },
    ],
    examples: [
      {
        command: "firetg messages list --chat me --limit 20",
        summary: "Read the latest saved-message history",
      },
      {
        command: "firetg messages list --chat me --search deploy --limit 10",
        summary: "Search within one chat",
      },
    ],
    aliases: ["messages:list"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "messages", "list") ||
    parsed.command === "messages:list",
  async run({ parsed, context }) {
    const chat = parsed.flags.get("chat");

    if (!chat) {
      writeInputError(
        context,
        messagesListCommand,
        "messages list requires --chat",
      );
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, {
        data: messagesForOutput(
          await telegram.listMessages({
            chat,
            limit: readPositiveInt(parsed.flags, "limit", 20),
            search: parsed.flags.get("search"),
          }),
          parsed.flags.has("full-text"),
        ),
      });
      return 0;
    });
  },
};

export const messagesSearchCommand: CommandSpec = {
  id: "messages.search",
  usage: "messages search --chat <peer> (--hashtag <tag> | --reply-to <id> --from <peer[,peer...]>) [--limit <n>]",
  help: {
    summary: "Search messages in a scoped stream",
    description:
      "Searches one chat by hashtag, or reads replies to one message from selected senders.",
    options: [
      {
        name: "--chat",
        value: "<peer>",
        summary: "Chat, username, id, or peer alias",
        required: true,
      },
      {
        name: "--hashtag",
        value: "<tag>",
        summary: "Hashtag to search for, with or without #",
      },
      {
        name: "--reply-to",
        value: "<id>",
        summary: "Message id whose replies should be searched",
        integer: { min: 1 },
      },
      {
        name: "--from",
        value: "<peer[,peer...]>",
        summary: "Reply sender username or id; comma-separated for multiple senders",
      },
      {
        name: "--limit",
        value: "<n>",
        summary: "Maximum messages to return",
        defaultValue: "100 for hashtags, 50 for replies",
        integer: { min: 1, max: 100 },
      },
      {
        name: "--full-text",
        summary:
          "Return complete message text instead of the 1000-character preview",
      },
    ],
    examples: [
      {
        command:
          'firetg messages search --chat launch-team --hashtag "#deploy"',
        summary: "Find deploy-tagged messages",
      },
      {
        command:
          "firetg messages search --chat launch-team --reply-to 101 --from 42,alice",
        summary: "Find replies to one message from selected senders",
      },
    ],
    aliases: ["messages:search"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "messages", "search") ||
    parsed.command === "messages:search",
  async run({ parsed, context }) {
    const chat = parsed.flags.get("chat")?.trim();
    const hashtag = normalizeHashtag(parsed.flags.get("hashtag"));
    const replyTo = readRequiredPositiveInt(parsed.flags.get("reply-to"));
    const from = readCommaSeparated(parsed.flags.get("from"));

    if (!chat) {
      writeInputError(
        context,
        messagesSearchCommand,
        "messages search requires --chat",
      );
      return 1;
    }

    if (hashtag && replyTo !== undefined) {
      writeInputError(
        context,
        messagesSearchCommand,
        "messages search accepts either --hashtag or --reply-to, not both",
      );
      return 1;
    }

    if (hashtag && from.length > 0) {
      writeInputError(
        context,
        messagesSearchCommand,
        "messages search accepts --from only with --reply-to",
      );
      return 1;
    }

    if (!hashtag && replyTo === undefined) {
      writeInputError(
        context,
        messagesSearchCommand,
        "messages search requires --hashtag or --reply-to with --from",
      );
      return 1;
    }

    if (replyTo !== undefined && from.length === 0) {
      writeInputError(
        context,
        messagesSearchCommand,
        "messages search requires --from when using --reply-to",
      );
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      if (replyTo !== undefined) {
        writeSuccess(context, {
          data: messagesForOutput(
            await telegram.listReplies({
              chat,
              messageId: replyTo,
              from,
              limit: readPositiveInt(parsed.flags, "limit", 50),
            }),
            parsed.flags.has("full-text"),
          ),
        });
        return 0;
      }

      writeSuccess(context, {
        data: messagesForOutput(
          await telegram.listMessages({
            chat,
            search: hashtag,
            limit: readPositiveInt(parsed.flags, "limit", 100),
          }),
          parsed.flags.has("full-text"),
        ),
      });
      return 0;
    });
  },
};

export const messagesPinnedCommand: CommandSpec = {
  id: "messages.pinned",
  usage: "messages pinned --chat <peer> [--limit <n>]",
  help: {
    summary: "List pinned messages from a chat",
    description:
      "Reads pinned messages from one Telegram chat or channel, newest first.",
    options: [
      {
        name: "--chat",
        value: "<peer>",
        summary: "Chat, channel username, id, or peer alias",
        required: true,
      },
      {
        name: "--limit",
        value: "<n>",
        summary: "Maximum pinned messages to return",
        defaultValue: "20",
        integer: { min: 1, max: 100 },
      },
      {
        name: "--full-text",
        summary:
          "Return complete message text instead of the 1000-character preview",
      },
    ],
    examples: [
      {
        command: "firetg messages pinned --chat example_channel --limit 20",
        summary: "Read latest pinned channel messages",
      },
    ],
    aliases: ["messages:pinned"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "messages", "pinned") ||
    parsed.command === "messages:pinned",
  async run({ parsed, context }) {
    const chat = parsed.flags.get("chat");

    if (!chat) {
      writeInputError(
        context,
        messagesPinnedCommand,
        "messages pinned requires --chat",
      );
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, {
        data: messagesForOutput(
          await telegram.listPinnedMessages({
            chat,
            limit: readPositiveInt(parsed.flags, "limit", 20),
          }),
          parsed.flags.has("full-text"),
        ),
      });
      return 0;
    });
  },
};

function normalizeHashtag(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function readCommaSeparated(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readRequiredPositiveInt(value?: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;

  return parsed;
}
