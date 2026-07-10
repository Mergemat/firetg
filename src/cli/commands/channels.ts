import { readPositiveInt } from "../args";
import { writeError, writeSuccess } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandInput, CommandSpec } from "./types";

export const channelViewCommand: CommandSpec = {
  id: "channels.view",
  usage: "channels view (--username <username> | --id <channel-id>)",
  help: {
    summary: "Show Telegram channel details",
    description:
      "Returns channel metadata, including description and pinned message when available.",
    options: [
      {
        name: "--username",
        value: "<username>",
        summary: "Channel username, with or without @",
      },
      {
        name: "--id",
        value: "<channel-id>",
        summary: "Known channel id",
      },
    ],
    examples: [
      {
        command: "firetg channels view --username telegram",
        summary: "Lookup a public channel username",
      },
      {
        command: "firetg channels view --username @telegram",
        summary: "Lookup a username with @ prefix",
      },
      {
        command: "firetg channels view --id 100",
        summary: "Lookup a known channel id",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "channels", "view"),
  run: ({ parsed, context }) => {
    const username = parsed.flags.get("username")?.trim();
    const id = parsed.flags.get("id")?.trim();

    if (!username && !id) {
      writeError(
        context,
        "INPUT_ERROR",
        "channels view requires --username or --id",
      );
      return Promise.resolve(1);
    }

    if (username && id) {
      writeError(
        context,
        "INPUT_ERROR",
        "channels view accepts either --username or --id, not both",
      );
      return Promise.resolve(1);
    }

    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, {
        data: await telegram.getChannel(username ?? id ?? ""),
      });
      return 0;
    });
  },
};

export const channelMessagesCommand: CommandSpec = {
  id: "channels.messages",
  usage: "channels messages (--username <username> | --id <channel-id>) [--limit <n>]",
  help: {
    summary: "List channel messages",
    description: "Reads channel message history, newest first.",
    options: [
      {
        name: "--username",
        value: "<username>",
        summary: "Channel username, with or without @",
      },
      {
        name: "--id",
        value: "<channel-id>",
        summary: "Known channel id",
      },
      {
        name: "--limit",
        value: "<n>",
        summary: "Maximum messages to return",
        defaultValue: "20",
      },
    ],
    examples: [
      {
        command: "firetg channels messages --username example_channel --limit 50",
        summary: "Read latest channel messages",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "channels", "messages"),
  run: ({ parsed, context }) => {
    const channel = readChannelLookup(parsed.flags);
    if (!channel) {
      writeChannelLookupError(context, parsed.flags, "channels messages");
      return Promise.resolve(1);
    }

    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, {
        data: await telegram.listMessages({
          chat: channel,
          limit: readPositiveInt(parsed.flags, "limit", 20),
        }),
      });
      return 0;
    });
  },
};

export const channelPinnedCommand: CommandSpec = {
  id: "channels.pinned",
  usage: "channels pinned (--username <username> | --id <channel-id>) [--limit <n>]",
  help: {
    summary: "List pinned channel messages",
    description: "Reads pinned messages from a channel, newest first.",
    options: [
      {
        name: "--username",
        value: "<username>",
        summary: "Channel username, with or without @",
      },
      {
        name: "--id",
        value: "<channel-id>",
        summary: "Known channel id",
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
        command: "firetg channels pinned --username example_channel --limit 20",
        summary: "Read latest pinned channel messages",
      },
    ],
  },
  matches: (parsed) => matchesScopedCommand(parsed, "channels", "pinned"),
  run: ({ parsed, context }) => {
    const channel = readChannelLookup(parsed.flags);
    if (!channel) {
      writeChannelLookupError(context, parsed.flags, "channels pinned");
      return Promise.resolve(1);
    }

    return runWithTelegram(context, async (telegram) => {
      writeSuccess(context, {
        data: await telegram.listPinnedMessages({
          chat: channel,
          limit: readPositiveInt(parsed.flags, "limit", 20),
        }),
      });
      return 0;
    });
  },
};

function readChannelLookup(
  flags: Map<string, string>,
): string | undefined {
  const username = flags.get("username")?.trim();
  const id = flags.get("id")?.trim();

  if (!username && !id) return undefined;
  if (username && id) return undefined;

  return username ?? id;
}

function writeChannelLookupError(
  context: CommandInput["context"],
  flags: Map<string, string>,
  command: string,
) {
  const username = flags.get("username")?.trim();
  const id = flags.get("id")?.trim();

  writeError(
    context,
    "INPUT_ERROR",
    username && id
      ? `${command} accepts either --username or --id, not both`
      : `${command} requires --username or --id`,
  );
}
