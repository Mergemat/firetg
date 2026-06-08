import { writeError, writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const sendCommand: CommandSpec = {
  id: "messages.send",
  usage: "messages send (--username <username> | --id <user-id>) --text <message>",
  help: {
    summary: "Send a message",
    description:
      "Sends a text message to a Telegram user and returns the sent message as JSON.",
    options: [
      {
        name: "--username",
        value: "<username>",
        summary: "Destination username, with or without @",
      },
      {
        name: "--id",
        value: "<user-id>",
        summary: "Destination known Telegram user id",
      },
      {
        name: "--text",
        value: "<message>",
        summary: "Message text",
        required: true,
      },
    ],
    examples: [
      {
        command: 'firetg messages send --username telegram --text "hello"',
        summary: "Send a message by username",
      },
      {
        command: 'firetg messages send --id 123456789 --text "hello"',
        summary: "Send a message by known user id",
      },
    ],
    aliases: ["send"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "messages", "send") ||
    parsed.command === "send",
  async run({ parsed, context }) {
    if (parsed.flags.has("to")) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send does not support --to; use --username or --id",
      );
      return 1;
    }

    const destinations = [
      parsed.flags.get("username"),
      parsed.flags.get("id"),
    ].filter((destination): destination is string => !!destination);
    const to = destinations[0];
    const text = parsed.flags.get("text");

    if (destinations.length > 1) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send accepts only one destination flag",
      );
      return 1;
    }

    if (!to || !text) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send requires --username or --id plus --text",
      );
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.sendMessage(to, text),
      });
      return 0;
    });
  },
};
