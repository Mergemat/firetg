import { readTelegramConfig } from "../../config";
import { createTeleprotoClient, type FireTgClient } from "../../telegram";
import { parseFloodWaitSeconds, RateLimitedError } from "../../telegram/errors";
import type { ParsedArgs } from "../args";
import { errorMessage, writeError } from "../output";
import type { CliContext } from "../types";

export async function runWithTelegram(
  context: CliContext,
  handler: (telegram: FireTgClient) => Promise<number>,
  options: {
    onError?: (
      error: unknown,
    ) => Promise<number | undefined> | number | undefined;
  } = {},
): Promise<number> {
  const configResult = await readTelegramConfig(context.env);

  if (!configResult.config) {
    writeError(
      context,
      "CONFIG_ERROR",
      `Missing ${configResult.missing.join(", ")}`,
    );
    return 1;
  }

  let telegram: FireTgClient | undefined;

  try {
    telegram = await (context.createTelegram ?? createTeleprotoClient)(
      configResult.config,
    );
    return await handler(telegram);
  } catch (error) {
    const handled = await options.onError?.(error);
    if (handled !== undefined) return handled;

    return writeTelegramError(context, error);
  } finally {
    await telegram?.disconnect?.();
  }
}

function writeTelegramError(context: CliContext, error: unknown): number {
  if (error instanceof RateLimitedError) {
    writeError(context, "RATE_LIMITED", error.message, {
      blockedUntil: error.blockedUntil,
      remainingSeconds: error.remainingSeconds,
    });
    return 2;
  }

  const waitSeconds = parseFloodWaitSeconds(error);
  if (waitSeconds !== undefined) {
    const blockedUntil = new Date(
      commandNow(context).getTime() + waitSeconds * 1000,
    ).toISOString();

    writeError(
      context,
      "RATE_LIMITED",
      `Telegram flood wait: retry after ${blockedUntil}`,
      { blockedUntil, remainingSeconds: waitSeconds },
    );
    return 2;
  }

  writeError(context, "TELEGRAM_ERROR", errorMessage(error));
  return 2;
}

export function commandNow(context: CliContext): Date {
  return context.now?.() ?? new Date();
}

export function matchesScopedCommand(
  parsed: ParsedArgs,
  scope: string,
  action: string,
): boolean {
  return parsed.command === scope && parsed.subcommand === action;
}
