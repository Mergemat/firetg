import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { writeError, writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const sendCommand: CommandSpec = {
  id: "messages.send",
  usage:
    "messages send (--username <username> | --id <user-id>) (--text <message> | --file <path>) [--document]",
  help: {
    summary: "Send a message",
    description:
      "Sends a text message or local file attachment to a Telegram user and returns the sent message as JSON.",
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
        summary: "Message text, or attachment caption when used with --file",
      },
      {
        name: "--file",
        value: "<path>",
        summary: "Local image, video, audio, or document path to send",
      },
      {
        name: "--attachment",
        value: "<path>",
        summary: "Alias for --file",
      },
      {
        name: "--document",
        summary: "Send --file as a document instead of inferred media",
      },
      {
        name: "--force-document",
        summary: "Alias for --document",
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
      {
        command: 'firetg messages send --username telegram --file ./photo.jpg --text "caption"',
        summary: "Send an image with a caption",
      },
      {
        command: "firetg messages send --username telegram --file ./report.pdf --document",
        summary: "Send a document attachment",
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
    const hasFile = parsed.flags.has("file");
    const hasAttachment = parsed.flags.has("attachment");
    const attachment = parsed.flags.get("file") ?? parsed.flags.get("attachment");

    if (destinations.length > 1) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send accepts only one destination flag",
      );
      return 1;
    }

    if (hasFile && hasAttachment) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send accepts either --file or --attachment, not both",
      );
      return 1;
    }

    if ((hasFile || hasAttachment) && !attachment) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send requires a path for --file or --attachment",
      );
      return 1;
    }

    if (!to || (!text && !attachment)) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send requires --username or --id plus --text or --file",
      );
      return 1;
    }

    const attachmentPath = attachment ? resolve(attachment) : undefined;
    if (attachmentPath) {
      const attachmentStat = await stat(attachmentPath).catch(() => undefined);
      if (!attachmentStat?.isFile()) {
        writeError(
          context,
          "INPUT_ERROR",
          `attachment file not found: ${attachmentPath}`,
        );
        return 1;
      }
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.sendMessage(
          to,
          attachmentPath
            ? {
                text: text || undefined,
                attachment: attachmentPath,
                forceDocument:
                  parsed.flags.has("document") ||
                  parsed.flags.has("force-document"),
              }
            : text ?? "",
        ),
      });
      return 0;
    });
  },
};
