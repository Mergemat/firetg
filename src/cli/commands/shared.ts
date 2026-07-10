import { loadTelegramConfig } from "../../config";
import { ConfigError } from "../../localStore";
import {
  createMtcuteClient,
  type FireTgClient,
  type MessageSummary,
} from "../../telegram";
import { rpcErrorText, telegramWait } from "../../telegram/errors";
import type { ParsedArgs } from "../args";
import { errorMessage, writeError } from "../output";
import type { CliContext } from "../types";

export async function runWithTelegram(
  context: CliContext,
  handler: (telegram: FireTgClient) => Promise<number>,
  options: {
    operation?: "read" | "send" | "auth";
    onError?: (
      error: unknown,
    ) => Promise<number | undefined> | number | undefined;
  } = {},
): Promise<number> {
  let telegram: FireTgClient | undefined;

  try {
    const config = await loadTelegramConfig(context.store);
    telegram = await (context.createTelegram ?? createMtcuteClient)(config);
    return await handler(telegram);
  } catch (error) {
    const handled = await options.onError?.(error);
    if (handled !== undefined) return handled;

    return writeTelegramError(context, error, options.operation);
  } finally {
    await telegram?.disconnect().catch(() => undefined);
  }
}

export function writeTelegramError(
  context: CliContext,
  error: unknown,
  operation: "read" | "send" | "auth" = "read",
): number {
  const wait = telegramWait(error);
  if (wait) {
    const blockedUntil = new Date(
      commandNow(context).getTime() + wait.seconds * 1000,
    ).toISOString();

    writeError(
      context,
      "RATE_LIMITED",
      waitMessage(wait.kind, blockedUntil, wait.seconds, operation),
      { blockedUntil, remainingSeconds: wait.seconds },
    );
    return 2;
  }

  const configFailure = isConfigFailure(error);
  writeError(
    context,
    configFailure ? "CONFIG_ERROR" : "TELEGRAM_ERROR",
    configFailure
      ? errorMessage(error)
      : telegramErrorMessage(error, operation),
  );
  return configFailure ? 1 : 2;
}

function waitMessage(
  kind: "rate" | "slowmode" | "login" | "premium",
  blockedUntil: string,
  seconds: number,
  operation: "read" | "send" | "auth",
): string {
  const retry = `Retry at ${blockedUntil} (in ${formatDuration(seconds)})`;
  if (kind === "slowmode") {
    return `This chat has slow mode enabled. ${retry}; other chats are unaffected`;
  }
  if (kind === "login") {
    return `Telegram limited repeated test-login attempts. ${retry}; do not request another code earlier`;
  }
  if (kind === "premium") {
    return `Telegram limited this action for non-Premium accounts. ${retry}; Premium may remove this specific limit`;
  }
  if (operation === "auth") {
    return `Telegram rate-limited repeated login attempts. ${retry}; do not request another code or retry earlier`;
  }
  return `Telegram rate-limited this action after too many similar requests. ${retry}; avoid retrying it earlier or in parallel`;
}

function telegramErrorMessage(
  error: unknown,
  operation: "read" | "send" | "auth",
): string {
  const text = rpcErrorText(error);
  const guidance: Record<string, string> = {
    AUTH_KEY_UNREGISTERED: "Telegram session is no longer valid. Run firetg auth login interactively",
    SESSION_REVOKED: "Telegram session was revoked. Run firetg auth login interactively",
    SESSION_EXPIRED: "Telegram session expired. Run firetg auth login interactively",
    USERNAME_INVALID: "Telegram username is invalid. Check the username and retry",
    USERNAME_NOT_OCCUPIED: "Telegram username was not found. Check the username and retry",
    PEER_ID_INVALID: "Telegram cannot resolve this peer in the current session. Use a username or run firetg dialogs list first",
    CHANNEL_PRIVATE: "This channel is private or inaccessible. Join it or obtain access before retrying",
    CHAT_WRITE_FORBIDDEN: "This account cannot send messages to that chat. Do not retry unchanged",
    USER_PRIVACY_RESTRICTED: "The recipient's privacy settings reject this action. Do not retry unchanged",
    USER_IS_BLOCKED: "The recipient is blocked. Unblock them before retrying",
    YOU_BLOCKED_USER: "The recipient is blocked. Unblock them before retrying",
    MESSAGE_TOO_LONG: "The message is too long. Shorten or split --text",
    PEER_FLOOD: "Telegram restricted this account for spam-like activity. Check @SpamBot; do not retry unchanged",
    PHONE_NUMBER_FLOOD: "Telegram limited repeated login attempts for this phone number. Stop requesting codes and try again later",
    PHONE_PASSWORD_FLOOD: "Telegram limited repeated password attempts. Stop retrying and try again later",
  };
  if (text && guidance[text]) return guidance[text];

  const raw = errorMessage(error);
  if (guidance[raw]) return guidance[raw];
  if (operation === "send") {
    return `${raw}. Delivery status may be unknown; check the chat before retrying to avoid a duplicate`;
  }
  if (operation === "auth") {
    return `${raw}. Check the login details and retry only after correcting the cause`;
  }
  return `${raw}. Retry once only if the failure appears transient`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    remainder || (!hours && !minutes) ? `${remainder}s` : "",
  ].filter(Boolean).join(" ");
}

function isConfigFailure(error: unknown): boolean {
  return error instanceof ConfigError;
}

function commandNow(context: CliContext): Date {
  return context.now?.() ?? new Date();
}

export function matchesScopedCommand(
  parsed: ParsedArgs,
  scope: string,
  action: string,
): boolean {
  return parsed.command === scope && parsed.subcommand === action;
}

const DEFAULT_MESSAGE_TEXT_LIMIT = 1000;

export function messagesForOutput(
  messages: MessageSummary[],
  fullText: boolean,
): MessageSummary[] {
  if (fullText) return messages;

  return messages.map((message) =>
    message.text.length <= DEFAULT_MESSAGE_TEXT_LIMIT
      ? message
      : {
          ...message,
          text: message.text.slice(0, DEFAULT_MESSAGE_TEXT_LIMIT),
          textTruncated: true,
        },
  );
}
