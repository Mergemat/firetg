import type { CliContext } from "./types";
import type { CommandSpec } from "./commands";

export type ErrorCode =
  | "CONFIG_ERROR"
  | "INTERACTIVE_REQUIRED"
  | "OUTPUT_ERROR"
  | "RATE_LIMITED"
  | "TELEGRAM_ERROR"
  | "TIMEOUT";

export function writeSuccess(
  context: CliContext,
  body: { data: unknown },
) {
  context.io.stdout(`${JSON.stringify(body.data)}\n`);
}

export function writeError(
  context: CliContext,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  context.io.stdout(`${JSON.stringify({
    ok: false,
    error: {
      code,
      message,
      ...details,
    },
  })}\n`);
}

export function writeInputError(
  context: CliContext,
  command: CommandSpec,
  message: string,
) {
  const sentence = /[.!?]$/.test(message) ? message : `${message}.`;
  context.io.stdout(`${sentence}\nUsage: firetg ${command.usage}\n`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
