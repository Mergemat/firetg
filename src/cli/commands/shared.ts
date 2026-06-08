import { readTelegramConfig } from "../../config";
import { createTeleprotoClient, type FireTgClient } from "../../telegram";
import { errorMessage, writeError } from "../output";
import type { CliContext } from "../types";

export async function runWithTelegram(
  context: CliContext,
  handler: (telegram: FireTgClient) => Promise<number>,
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
    writeError(context, "TELEGRAM_ERROR", errorMessage(error));
    return 2;
  } finally {
    await telegram?.disconnect?.();
  }
}
