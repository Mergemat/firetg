import type { CliContext } from "./types";

export type ErrorCode = "CONFIG_ERROR" | "INPUT_ERROR" | "TELEGRAM_ERROR";

export function writeJson(
  context: CliContext,
  ok: boolean,
  body: { data?: unknown; error?: unknown },
) {
  context.io.stdout(`${JSON.stringify(ok ? body.data : { ok, ...body })}\n`);
}

export function writeError(
  context: CliContext,
  code: ErrorCode,
  message: string,
) {
  writeJson(context, false, {
    error: {
      code,
      message,
    },
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
