import { writeError, writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

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
      writeJson(context, true, {
        data: await telegram.getChannel(username ?? id ?? ""),
      });
      return 0;
    });
  },
};
