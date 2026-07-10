import { loadTelegramConfig } from "../../config";
import { ConfigError } from "../../localStore";
import { createMtcuteClient, type FireTgClient } from "../../telegram";
import { floodWaitSeconds } from "../../telegram/errors";
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
  let telegram: FireTgClient | undefined;

  try {
    const config = await loadTelegramConfig(context.store);
    telegram = await (context.createTelegram ?? createMtcuteClient)(config);
    return await handler(telegram);
  } catch (error) {
    const handled = await options.onError?.(error);
    if (handled !== undefined) return handled;

    return writeTelegramError(context, error);
  } finally {
    await telegram?.disconnect().catch(() => undefined);
  }
}

function writeTelegramError(context: CliContext, error: unknown): number {
  const waitSeconds = floodWaitSeconds(error);
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

  const configFailure = isConfigFailure(error);
  writeError(
    context,
    configFailure ? "CONFIG_ERROR" : "TELEGRAM_ERROR",
    errorMessage(error),
  );
  return configFailure ? 1 : 2;
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
