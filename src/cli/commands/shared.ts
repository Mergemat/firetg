import { readTelegramConfig } from "../../config";
import { createTeleprotoClient, type FireTgClient } from "../../telegram";
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

    writeError(context, "TELEGRAM_ERROR", errorMessage(error));
    return 2;
  } finally {
    await telegram?.disconnect?.();
  }
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
