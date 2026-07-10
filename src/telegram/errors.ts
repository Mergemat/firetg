import { tl } from "@mtcute/bun";

export function floodWaitSeconds(error: unknown): number | undefined {
  const wait = telegramWait(error);
  return wait?.kind === "rate" ? wait.seconds : undefined;
}

export type TelegramWait = {
  kind: "rate" | "slowmode" | "login" | "premium";
  seconds: number;
};

export function telegramWait(error: unknown): TelegramWait | undefined {
  for (const candidate of errorChain(error)) {
    if (tl.RpcError.is(candidate, "FLOOD_WAIT_%d")) {
      return { kind: "rate", seconds: candidate.seconds };
    }
    if (tl.RpcError.is(candidate, "SLOWMODE_WAIT_%d")) {
      return { kind: "slowmode", seconds: candidate.seconds };
    }
    if (tl.RpcError.is(candidate, "FLOOD_TEST_PHONE_WAIT_%d")) {
      return { kind: "login", seconds: candidate.seconds };
    }
    if (tl.RpcError.is(candidate)) {
      const match = String(candidate.text).match(/^FLOOD_PREMIUM_WAIT_(\d+)$/);
      if (match?.[1]) return { kind: "premium", seconds: Number(match[1]) };
    }
  }
}

export function rpcErrorText(error: unknown): string | undefined {
  for (const candidate of errorChain(error)) {
    if (tl.RpcError.is(candidate)) return String(candidate.text);
  }
}

function* errorChain(error: unknown): Generator<unknown> {
  let candidate: unknown = error;
  const seen = new Set<unknown>();
  while (candidate && !seen.has(candidate)) {
    seen.add(candidate);
    yield candidate;
    candidate =
      candidate instanceof Error && "cause" in candidate
        ? candidate.cause
        : undefined;
  }
}
