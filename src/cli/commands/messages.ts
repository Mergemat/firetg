import { readPositiveInt } from "../args";
import { writeError, writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
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
      },
      {
        name: "--search",
        value: "<query>",
        summary: "Search query within the chat history",
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
      writeError(context, "INPUT_ERROR", "messages list requires --chat");
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.listMessages({
          chat,
          limit: readPositiveInt(parsed.flags, "limit", 20),
          search: parsed.flags.get("search"),
        }),
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
      writeError(context, "INPUT_ERROR", "messages pinned requires --chat");
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.listPinnedMessages({
          chat,
          limit: readPositiveInt(parsed.flags, "limit", 20),
        }),
      });
      return 0;
    });
  },
};
