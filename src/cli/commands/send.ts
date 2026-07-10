import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  errorMessage,
  writeError,
  writeInputError,
  writeSuccess,
} from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const sendCommand: CommandSpec = {
  id: "messages.send",
  usage:
    "messages send (--username <username> | --id <user-id>) (--text <message> | --file <path>) [--document] [--schedule-at <when>]",
  help: {
    summary: "Send a message",
    description:
      "Sends a text message or local file attachment to a Telegram user and returns the sent message as JSON.",
    options: [
      {
        name: "--to",
        value: "<peer>",
        summary: "Unsupported legacy destination flag",
        hidden: true,
      },
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
      {
        name: "--schedule-at",
        value: "<when>",
        summary: "Schedule delivery at ISO-8601 date-time or unix seconds",
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
      {
        command:
          'firetg messages send --username telegram --text "hello later" --schedule-at 2026-07-05T15:00',
        summary: "Schedule a message for later delivery",
      },
    ],
    aliases: ["send"],
  },
  matches: (parsed) =>
    matchesScopedCommand(parsed, "messages", "send") ||
    parsed.command === "send",
  async run({ parsed, context }) {
    if (parsed.flags.has("to")) {
      writeInputError(
        context,
        sendCommand,
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
    const scheduledAtFlag = parsed.flags.get("schedule-at");
    const hasFile = parsed.flags.has("file");
    const hasAttachment = parsed.flags.has("attachment");
    const attachment = parsed.flags.get("file") ?? parsed.flags.get("attachment");

    if (destinations.length > 1) {
      writeInputError(
        context,
        sendCommand,
        "messages send accepts only one destination flag",
      );
      return 1;
    }

    if (hasFile && hasAttachment) {
      writeInputError(
        context,
        sendCommand,
        "messages send accepts either --file or --attachment, not both",
      );
      return 1;
    }

    if ((hasFile || hasAttachment) && !attachment) {
      writeInputError(
        context,
        sendCommand,
        "messages send requires a path for --file or --attachment",
      );
      return 1;
    }

    if (
      (parsed.flags.has("document") || parsed.flags.has("force-document")) &&
      !attachment
    ) {
      writeInputError(
        context,
        sendCommand,
        "messages send accepts --document only with --file",
      );
      return 1;
    }

    if (!to || (!text && !attachment)) {
      writeInputError(
        context,
        sendCommand,
        "messages send requires --username or --id plus --text or --file",
      );
      return 1;
    }

    const scheduledAt = parseScheduledAt(scheduledAtFlag);
    if (parsed.flags.has("schedule-at") && scheduledAt === undefined) {
      writeInputError(
        context,
        sendCommand,
        "messages send requires --schedule-at to be ISO-8601 date-time or unix seconds",
      );
      return 1;
    }

    if (scheduledAt !== undefined && scheduledAt <= Math.floor(Date.now() / 1000)) {
      writeInputError(
        context,
        sendCommand,
        "messages send requires --schedule-at to be in the future",
      );
      return 1;
    }

    const attachmentPath = attachment ? resolve(attachment) : undefined;
    if (attachmentPath) {
      let attachmentStat;
      try {
        attachmentStat = await stat(attachmentPath);
      } catch (error) {
        if (!isMissingFile(error)) {
          writeError(
            context,
            "CONFIG_ERROR",
            `Could not access attachment ${attachmentPath}: ${errorMessage(error)}. Check the path and file permissions`,
          );
          return 1;
        }
      }
      if (!attachmentStat?.isFile()) {
        writeInputError(
          context,
          sendCommand,
          `attachment file not found: ${attachmentPath}`,
        );
        return 1;
      }
    }

    return runWithTelegram(
      context,
      async (telegram) => {
        const sent = await telegram.sendMessage(
          to,
          attachmentPath
            ? {
                text: text || undefined,
                attachment: attachmentPath,
                forceDocument:
                  parsed.flags.has("document") ||
                  parsed.flags.has("force-document"),
                ...(scheduledAt === undefined ? {} : { scheduledAt }),
              }
            : scheduledAt === undefined
              ? text ?? ""
              : { text: text ?? "", scheduledAt },
        );
        writeSuccess(context, {
          data: {
            id: sent.id,
            date: sent.date,
            ...(sent.media ? { media: sent.media } : {}),
          },
        });
        return 0;
      },
      { operation: "send" },
    );
  },
};

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseScheduledAt(value: string | undefined): number | undefined {
  if (!value) return undefined;

  if (/^\d+$/.test(value)) {
    const timestamp = Number(value);
    return Number.isSafeInteger(timestamp) ? timestamp : undefined;
  }

  const timestampMs = Date.parse(value);
  if (Number.isNaN(timestampMs)) return undefined;

  return Math.floor(timestampMs / 1000);
}
